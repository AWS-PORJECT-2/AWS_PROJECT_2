import type { Request, Response } from 'express';
import type { UserRepository } from '../repositories/user-repository.js';
import { AppError } from '../errors/app-error.js';
import { createErrorResponse } from '../errors/error-response.js';

export function createMeUpdateHandler(userRepo: UserRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json(createErrorResponse(new AppError('NOT_AUTHENTICATED')));
      return;
    }

    const { name, picture } = req.body as { name?: string; picture?: string };

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      res.status(400).json({ error: 'INVALID_NAME', message: '이름은 비어있을 수 없습니다' });
      return;
    }

    if (picture !== undefined) {
      if (typeof picture !== 'string') {
        res.status(400).json({ error: 'INVALID_PICTURE', message: '올바른 이미지 URL을 입력해주세요' });
        return;
      }
      // http(s) URL 또는 이미지 data URL 만 허용 + 용량 상한 (멀티MB base64 가 DB 에 통째로 들어가는 것 방지)
      const isHttp = /^https?:\/\//.test(picture);
      const isDataImage = /^data:image\/(png|jpe?g|webp);base64,/.test(picture);
      if ((!isHttp && !isDataImage) || picture.length > 2_000_000) {
        res.status(400).json({ error: 'INVALID_PICTURE', message: '허용되지 않는 이미지 형식이거나 용량이 너무 큽니다' });
        return;
      }
    }

    const updated = await userRepo.updateProfile(userId, {
      name: name?.trim(),
      picture,
    });

    if (!updated) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다' });
      return;
    }

    res.json({
      userId: updated.id,
      email: updated.email,
      name: updated.name,
      picture: updated.picture,
      schoolDomain: updated.schoolDomain,
    });
  };
}
