import type { Request, Response } from 'express';
import type { UserRepository } from '../repositories/user-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';
import { logger } from '../logger.js';

/** GET /api/admin/users — 사용자 목록 (관리자) */
export function createAdminUsersListHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const q = (req.query.q as string | undefined)?.trim().toLowerCase() || '';
      let users = await userRepo.listAll();
      if (q) users = users.filter((u) => u.email.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q));
      res.json({
        items: users.map((u) => ({
          id: u.id, email: u.email, name: u.name, role: u.role ?? 'USER',
          schoolDomain: u.schoolDomain, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
        })),
      });
    } catch (err) {
      logger.error({ err }, '관리자 사용자 목록 조회 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}

/** POST /api/admin/users/:id/role — 권한 변경 (USER/ADMIN). 본인 강등 방지. */
export function createAdminSetUserRoleHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const targetId = req.params.id;
    const role = req.body?.role === 'ADMIN' ? 'ADMIN' : 'USER';
    if (role === 'USER' && targetId === req.userId) {
      res.status(400).json({ error: 'SELF_DEMOTE', message: '본인 계정은 강등할 수 없습니다' });
      return;
    }
    try {
      const target = await userRepo.findById(targetId);
      if (!target) { res.status(404).json({ error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' }); return; }
      await userRepo.setRole(targetId, role);
      logger.info({ targetId, role, adminId: req.userId }, '관리자 권한 변경');
      res.json({ id: targetId, role });
    } catch (err) {
      logger.error({ err, targetId }, '권한 변경 실패');
      res.status(500).json(createErrorResponse(new AppError('INTERNAL_ERROR')));
    }
  };
}
