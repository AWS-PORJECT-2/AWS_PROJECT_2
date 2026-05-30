import type { Request, Response } from 'express';
import type { UserRepository } from '../repositories/user-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

const NICK_MAX = 40;
const NAME_MAX = 40;
const PHONE_RE = /^[0-9\-+ ]{7,20}$/;
const MAX_PICTURE_CHARS = 4_000_000; // 프로필 이미지 data URL 약 3MB 상한

/**
 * PATCH /api/me — 프로필 수정 + 온보딩 완료 표시.
 * body: { nickname?, phone?, realName?, picture? }
 * 닉네임이 채워지면 onboarded=true 로 처리(첫 로그인 온보딩 완료).
 */
export function createUpdateMeHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED'))); return; }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: { nickname?: string; phone?: string; realName?: string; picture?: string; onboarded?: boolean; name?: string } = {};

    if (typeof body.nickname === 'string') {
      const v = body.nickname.trim();
      if (v.length === 0 || v.length > NICK_MAX) { res.status(400).json({ error: 'INVALID', message: '닉네임은 1~40자입니다' }); return; }
      patch.nickname = v;
      patch.name = v;          // 표시 이름도 닉네임으로 동기화
      patch.onboarded = true;  // 닉네임 설정 = 온보딩 완료
    }
    if (typeof body.realName === 'string') {
      const v = body.realName.trim();
      if (v.length > NAME_MAX) { res.status(400).json({ error: 'INVALID', message: '이름이 너무 깁니다' }); return; }
      patch.realName = v;
    }
    if (typeof body.phone === 'string') {
      const v = body.phone.trim();
      if (v && !PHONE_RE.test(v)) { res.status(400).json({ error: 'INVALID', message: '전화번호 형식이 올바르지 않습니다' }); return; }
      patch.phone = v;
    }
    if (typeof body.picture === 'string') {
      const v = body.picture;
      if (v.length > MAX_PICTURE_CHARS) { res.status(400).json({ error: 'INVALID', message: '이미지가 너무 큽니다(3MB 이하)' }); return; }
      const ok = /^https?:\/\//.test(v) || /^data:image\/(png|jpe?g|webp);base64,/.test(v);
      if (!ok) { res.status(400).json({ error: 'INVALID', message: '이미지 형식이 올바르지 않습니다' }); return; }
      patch.picture = v;
    }

    if (Object.keys(patch).length === 0) { res.status(400).json({ error: 'EMPTY', message: '변경할 내용이 없습니다' }); return; }

    try {
      const updated = await userRepo.updateProfile(userId, patch);
      if (!updated) { res.status(404).json({ error: 'USER_NOT_FOUND', message: '계정을 찾을 수 없습니다' }); return; }
      res.json({
        userId: updated.id, email: updated.email, name: updated.name, picture: updated.picture ?? null,
        nickname: updated.nickname ?? null, phone: updated.phone ?? null, realName: updated.realName ?? null,
        onboarded: updated.onboarded ?? false, role: updated.role ?? 'USER',
      });
    } catch (err) {
      logger.error({ err, userId }, '프로필 수정 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
