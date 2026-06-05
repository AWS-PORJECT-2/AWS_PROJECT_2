import { Router } from 'express';
import type { Request, Response } from 'express';
import pg from 'pg';
import type { UserRepository } from '../repositories/user-repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token-repository.js';
import type { NotificationRepository } from '../repositories/notification-repository.js';
import type { User } from '../types/index.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';
import { logAudit } from '../services/audit-log.js';
import { notify } from '../services/notify.js';
import { recordModeration, listModeration, getUserActivity } from '../services/moderation.js';
import { uuidParamGuard } from '../middleware/uuid-param.js';

const MAX_SUSPEND_DAYS = 3650;

// 목록/상세에 노출할 사용자 필드(민감정보 최소화) — phone 등은 제외.
function publicUser(u: User) {
  return {
    id: u.id, email: u.email, name: u.name, nickname: u.nickname ?? null,
    picture: u.picture ?? null, slug: u.slug ?? null, role: u.role ?? 'USER',
    status: u.status ?? 'ACTIVE', suspendedUntil: u.suspendedUntil ?? null, suspensionReason: u.suspensionReason ?? null,
    schoolDomain: u.schoolDomain, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
  };
}

function fail(res: Response, err: unknown, msg: string): void {
  if (err instanceof AppError) { res.status(err.httpStatus).json(createErrorResponse(err)); return; }
  logger.error({ err }, msg);
  res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
}

// KST 표기(알림 문구용).
function fmtKst(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') + ' (KST)';
}

/**
 * 관리자 사용자 관리 라우터. (authRequired + requireAdmin 은 마운트 측에서 적용)
 * 목록/상세/제재(정지·차단·해제)/탈퇴·복구/이름변경/알림·경고/메모/강제로그아웃/권한.
 * 모든 제재는 user_moderation_actions 이력 + audit_logs 기록 + (대상에게) 알림.
 */
export function createAdminUsersRouter(
  userRepo: UserRepository,
  refreshTokenRepo: RefreshTokenRepository,
  notificationRepo: NotificationRepository,
  pool: pg.Pool,
): Router {
  const router = Router();
  router.param('id', uuidParamGuard);

  const notFound = (res: Response) => res.status(404).json({ error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' });
  const badReq = (res: Response, msg: string) => res.status(400).json(createErrorResponse(new AppError('MISSING_REQUIRED_FIELD', msg)));
  const reasonOf = (req: Request): string | null => {
    const r = (req.body?.reason ?? '');
    return typeof r === 'string' && r.trim() ? r.trim().slice(0, 1000) : null;
  };
  // 본인 계정에 파괴적 작업(정지/차단/탈퇴/강등/강제로그아웃) 방지.
  const blockSelf = (req: Request, res: Response): boolean => {
    if (req.params.id === req.userId) { res.status(400).json({ error: 'SELF_TARGET', message: '본인 계정에는 할 수 없습니다' }); return true; }
    return false;
  };
  // 마지막 활동관리자 보호는 userRepo.setStatus/setRole 안에서 원자적으로(어드바이저리 락) 처리되어
  //  위반 시 AppError('LAST_ADMIN')(409)을 던진다 → 각 핸들러 try/catch 의 fail() 이 그대로 응답.
  // 제재 시 대상의 기존 실시간 소켓(채팅)도 즉시 끊는다(연결 핸드셰이크 게이트는 신규 연결만 막으므로).
  const disconnectSockets = async (req: Request, userId: string): Promise<void> => {
    try {
      const io = (req.app as { io?: { fetchSockets: () => Promise<Array<{ data?: { userId?: string }; disconnect: (close: boolean) => void }>> } }).io;
      if (!io) return;
      const sockets = await io.fetchSockets();
      for (const s of sockets) { if (s.data?.userId === userId) s.disconnect(true); }
    } catch { /* best-effort */ }
  };

  // 목록 — 상태/역할/검색 필터.
  router.get('/', async (req: Request, res: Response) => {
    try {
      const q = (req.query.q as string | undefined)?.trim().toLowerCase() || '';
      const status = (req.query.status as string | undefined)?.toUpperCase();
      let users = await userRepo.listAll();
      if (q) users = users.filter((u) => u.email.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q) || (u.nickname || '').toLowerCase().includes(q));
      if (status && ['ACTIVE', 'SUSPENDED', 'BANNED', 'WITHDRAWN'].includes(status)) users = users.filter((u) => (u.status ?? 'ACTIVE') === status);
      res.json({ items: users.map(publicUser) });
    } catch (e) { fail(res, e, '관리자 사용자 목록 조회 실패'); }
  });

  // 상세 — 프로필 + 활동 집계 + 제재 이력.
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const u = await userRepo.findById(req.params.id);
      if (!u) { notFound(res); return; }
      const [activity, history] = await Promise.all([getUserActivity(pool, u.id), listModeration(pool, u.id, 50)]);
      res.json({ user: publicUser(u), activity, history });
    } catch (e) { fail(res, e, '관리자 사용자 상세 조회 실패'); }
  });

  // 상태 변경(정지/차단/해제) — status: SUSPENDED | BANNED | ACTIVE
  router.post('/:id/status', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const status = String(req.body?.status || '').toUpperCase();
      if (!['SUSPENDED', 'BANNED', 'ACTIVE'].includes(status)) { badReq(res, '상태 값이 올바르지 않습니다'); return; }
      if (status !== 'ACTIVE' && blockSelf(req, res)) return;
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      const reason = reasonOf(req);

      let suspendedUntil: Date | null = null;
      if (status === 'SUSPENDED') {
        // until(ISO) 우선, 없으면 days 로 계산. 미래 시각이어야 함.
        if (typeof req.body?.until === 'string') { const d = new Date(req.body.until); if (!isNaN(d.getTime())) { const cap = Date.now() + MAX_SUSPEND_DAYS * 86400_000; suspendedUntil = d.getTime() > cap ? new Date(cap) : d; } }
        else if (Number(req.body?.days) > 0) suspendedUntil = new Date(Date.now() + Math.min(Number(req.body.days), MAX_SUSPEND_DAYS) * 86400_000);
        if (!suspendedUntil || suspendedUntil.getTime() <= Date.now()) { badReq(res, '정지 기간(일수 또는 해제일)을 올바르게 입력해 주세요'); return; }
      }

      const updated = await userRepo.setStatus(targetId, { status: status as 'SUSPENDED' | 'BANNED' | 'ACTIVE', suspendedUntil, reason, adminId: req.userId ?? null });
      if (!updated) { notFound(res); return; }

      // 정지/차단 시 즉시 강제 로그아웃(모든 refresh token 폐기 + 기존 실시간 소켓 종료).
      if (status !== 'ACTIVE') {
        try { await refreshTokenRepo.deleteByUserId(targetId); } catch (e) { logger.warn({ e, targetId }, '상태변경 토큰폐기 실패'); }
        void disconnectSockets(req, targetId);
      }

      const action = status === 'SUSPENDED' ? 'suspend' : status === 'BANNED' ? 'ban' : 'unban';
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action, reason, meta: { until: suspendedUntil?.toISOString() ?? null } });
      void logAudit(pool, { level: 'info', source: 'admin', message: `사용자 ${action}`, meta: { targetId, status, until: suspendedUntil?.toISOString() ?? null }, userId: req.userId ?? null });

      // 대상에게 알림.
      if (status === 'SUSPENDED') await notify(notificationRepo, { userId: targetId, type: 'account_suspended', title: '계정이 정지되었습니다', body: `${fmtKst(suspendedUntil as Date)} 까지 이용이 제한됩니다.${reason ? ' 사유: ' + reason : ''}` });
      else if (status === 'BANNED') await notify(notificationRepo, { userId: targetId, type: 'account_banned', title: '계정 이용이 제한되었습니다', body: `이용이 영구 제한되었습니다.${reason ? ' 사유: ' + reason : ''}` });
      else await notify(notificationRepo, { userId: targetId, type: 'account_unbanned', title: '계정 제한이 해제되었습니다', body: '정상적으로 서비스를 이용하실 수 있습니다.' });

      res.json({ user: publicUser(updated) });
    } catch (e) { fail(res, e, '사용자 상태 변경 실패'); }
  });

  // 강제 탈퇴(soft) — status=WITHDRAWN + 강제 로그아웃. (데이터는 보존, 로그인 차단)
  router.post('/:id/withdraw', async (req: Request, res: Response) => {
    try {
      if (blockSelf(req, res)) return;
      const targetId = req.params.id;
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      const reason = reasonOf(req);
      const updated = await userRepo.setStatus(targetId, { status: 'WITHDRAWN', reason, adminId: req.userId ?? null });
      if (!updated) { notFound(res); return; }
      try { await refreshTokenRepo.deleteByUserId(targetId); } catch (e) { logger.warn({ e, targetId }, '탈퇴 토큰폐기 실패'); }
      void disconnectSockets(req, targetId);
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action: 'withdraw', reason });
      void logAudit(pool, { level: 'info', source: 'admin', message: '사용자 강제 탈퇴', meta: { targetId }, userId: req.userId ?? null });
      res.json({ user: publicUser(updated) });
    } catch (e) { fail(res, e, '사용자 탈퇴 처리 실패'); }
  });

  // 탈퇴 복구 — WITHDRAWN → ACTIVE.
  router.post('/:id/restore', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      const updated = await userRepo.setStatus(targetId, { status: 'ACTIVE', adminId: req.userId ?? null });
      if (!updated) { notFound(res); return; }
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action: 'restore', reason: reasonOf(req) });
      void logAudit(pool, { level: 'info', source: 'admin', message: '사용자 복구', meta: { targetId }, userId: req.userId ?? null });
      await notify(notificationRepo, { userId: targetId, type: 'account_unbanned', title: '계정이 복구되었습니다', body: '다시 서비스를 이용하실 수 있습니다.' });
      res.json({ user: publicUser(updated) });
    } catch (e) { fail(res, e, '사용자 복구 실패'); }
  });

  // 이름/닉네임 변경 — 변경 시 대상에게 알림.
  router.patch('/:id/name', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      const patch: { name?: string; nickname?: string } = {};
      if (typeof req.body?.name === 'string') { const n = req.body.name.trim().slice(0, 40); if (n) patch.name = n; }
      if (typeof req.body?.nickname === 'string') patch.nickname = req.body.nickname.trim().slice(0, 40); // 빈 문자열 허용(닉네임 제거)
      if (patch.name === undefined && patch.nickname === undefined) { badReq(res, '변경할 이름 또는 닉네임을 입력해 주세요'); return; }
      const updated = await userRepo.updateProfile(targetId, patch);
      if (!updated) { notFound(res); return; }
      const meta = { oldName: target.name, oldNickname: target.nickname ?? null, newName: updated.name, newNickname: updated.nickname ?? null };
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action: 'rename', reason: reasonOf(req), meta });
      void logAudit(pool, { level: 'info', source: 'admin', message: '사용자 이름 변경', meta: { targetId, ...meta }, userId: req.userId ?? null });
      await notify(notificationRepo, { userId: targetId, type: 'profile_renamed', title: '프로필 정보가 변경되었습니다', body: `관리자가 회원님의 ${patch.name !== undefined ? '이름' : ''}${patch.name !== undefined && patch.nickname !== undefined ? '/' : ''}${patch.nickname !== undefined ? '닉네임' : ''} 정보를 변경했습니다.` });
      res.json({ user: publicUser(updated) });
    } catch (e) { fail(res, e, '사용자 이름 변경 실패'); }
  });

  // 직접 알림 발송.
  router.post('/:id/notify', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 100) : '';
      const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 1000) : '';
      if (!title || !body) { badReq(res, '제목과 내용을 입력해 주세요'); return; }
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      await notify(notificationRepo, { userId: targetId, type: 'admin_message', title, body });
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action: 'notify', meta: { title } });
      res.json({ ok: true });
    } catch (e) { fail(res, e, '알림 발송 실패'); }
  });

  // 경고 — 알림 + 이력(접근 제한 없음).
  router.post('/:id/warn', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const reason = reasonOf(req);
      if (!reason) { badReq(res, '경고 사유를 입력해 주세요'); return; }
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      await notify(notificationRepo, { userId: targetId, type: 'account_warning', title: '관리자 경고', body: reason });
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action: 'warn', reason });
      void logAudit(pool, { level: 'info', source: 'admin', message: '사용자 경고', meta: { targetId }, userId: req.userId ?? null });
      res.json({ ok: true });
    } catch (e) { fail(res, e, '경고 처리 실패'); }
  });

  // 내부 메모(대상에게 안 보임) — 이력에만 기록.
  router.post('/:id/note', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 2000) : '';
      if (!note) { badReq(res, '메모 내용을 입력해 주세요'); return; }
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action: 'note', reason: note });
      res.json({ ok: true });
    } catch (e) { fail(res, e, '메모 저장 실패'); }
  });

  // 강제 로그아웃(모든 세션 폐기).
  router.post('/:id/force-logout', async (req: Request, res: Response) => {
    try {
      if (blockSelf(req, res)) return;
      const targetId = req.params.id;
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      await refreshTokenRepo.deleteByUserId(targetId);
      void disconnectSockets(req, targetId); // 기존 실시간 소켓도 종료
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action: 'force_logout' });
      void logAudit(pool, { level: 'info', source: 'admin', message: '사용자 강제 로그아웃', meta: { targetId }, userId: req.userId ?? null });
      res.json({ ok: true });
    } catch (e) { fail(res, e, '강제 로그아웃 실패'); }
  });

  // 권한(역할) 변경 — 본인 강등 방지 + 알림 + 이력.
  router.post('/:id/role', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const role = req.body?.role === 'ADMIN' ? 'ADMIN' : 'USER';
      if (role === 'USER' && targetId === req.userId) { res.status(400).json({ error: 'SELF_DEMOTE', message: '본인 계정은 강등할 수 없습니다' }); return; }
      const target = await userRepo.findById(targetId);
      if (!target) { notFound(res); return; }
      await userRepo.setRole(targetId, role); // 마지막 활동관리자 강등이면 repo 가 LAST_ADMIN(409) throw → fail()
      void recordModeration(pool, { targetUserId: targetId, adminId: req.userId ?? null, action: 'role', meta: { from: target.role ?? 'USER', to: role } });
      void logAudit(pool, { level: 'info', source: 'admin', message: '사용자 권한 변경', meta: { targetId, role }, userId: req.userId ?? null });
      await notify(notificationRepo, { userId: targetId, type: 'role_changed', title: '권한이 변경되었습니다', body: role === 'ADMIN' ? '관리자 권한이 부여되었습니다.' : '일반 사용자 권한으로 변경되었습니다.' });
      res.json({ id: targetId, role });
    } catch (e) { fail(res, e, '권한 변경 실패'); }
  });

  return router;
}
