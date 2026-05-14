import { Router } from 'express';
import type { Request, Response } from 'express';
import type { TokenService } from '../interfaces/token-service.js';
import type { AddressRepository } from '../repositories/address-repository.js';
import { logger } from '../logger.js';

function extractUserId(req: Request, res: Response, tokenService: TokenService): string | null {
  const token = req.cookies?.accessToken;
  if (!token) {
    res.status(401).json({ error: 'NOT_AUTHENTICATED', message: '로그인이 필요합니다' });
    return null;
  }
  const result = tokenService.verifyAccessTokenDetailed(token);
  if (!result.valid) {
    if (result.reason === 'expired') {
      res.status(401).json({ error: 'TOKEN_EXPIRED', message: '인증이 만료되었습니다' });
    } else {
      res.status(401).json({ error: 'INVALID_TOKEN', message: '유효하지 않은 인증입니다' });
    }
    return null;
  }
  return result.payload.userId;
}

export function createAddressRouter(addressRepository: AddressRepository, tokenService: TokenService): Router {
  const router = Router();

  // 배송지 목록 조회 — 프론트엔드가 배열을 직접 기대함
  router.get('/', async (req: Request, res: Response) => {
    const userId = extractUserId(req, res, tokenService);
    if (!userId) return;

    try {
      const addresses = await addressRepository.findByUserId(userId);
      res.json(addresses);
    } catch (err) {
      logger.error({ err, userId }, '배송지 목록 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 개별 배송지 조회
  router.get('/:id', async (req: Request, res: Response) => {
    const userId = extractUserId(req, res, tokenService);
    if (!userId) return;

    const { id } = req.params;

    try {
      const address = await addressRepository.findById(id, userId);
      if (!address) {
        res.status(404).json({ error: 'NOT_FOUND', message: '배송지를 찾을 수 없습니다' });
        return;
      }
      res.json(address);
    } catch (err) {
      logger.error({ err, userId }, '배송지 조회 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 배송지 등록
  router.post('/', async (req: Request, res: Response) => {
    const userId = extractUserId(req, res, tokenService);
    if (!userId) return;

    const { label, recipientName, recipientPhone, postalCode, roadAddress, jibunAddress, detailAddress, isDefault } = req.body;

    if (!recipientName || !recipientPhone || !postalCode || !roadAddress) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: '필수 항목을 입력해주세요 (수령인, 연락처, 우편번호, 도로명주소)' });
      return;
    }

    try {
      const address = await addressRepository.create({
        userId,
        label: label || '기본 배송지',
        recipientName,
        recipientPhone,
        postalCode,
        roadAddress,
        jibunAddress: jibunAddress || undefined,
        detailAddress: detailAddress || undefined,
        isDefault: isDefault ?? false,
      });
      res.status(201).json(address);
    } catch (err) {
      logger.error({ err, userId }, '배송지 등록 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 배송지 수정
  router.patch('/:id', async (req: Request, res: Response) => {
    const userId = extractUserId(req, res, tokenService);
    if (!userId) return;

    const { id } = req.params;

    // /default 경로와 충돌 방지 — 이 핸들러는 일반 수정용
    if (id === 'default') return;

    const { label, recipientName, recipientPhone, postalCode, roadAddress, jibunAddress, detailAddress, isDefault } = req.body;

    try {
      const updated = await addressRepository.update(id, userId, {
        ...(label !== undefined && { label }),
        ...(recipientName !== undefined && { recipientName }),
        ...(recipientPhone !== undefined && { recipientPhone }),
        ...(postalCode !== undefined && { postalCode }),
        ...(roadAddress !== undefined && { roadAddress }),
        ...(jibunAddress !== undefined && { jibunAddress }),
        ...(detailAddress !== undefined && { detailAddress }),
        ...(isDefault !== undefined && { isDefault }),
      });

      if (!updated) {
        res.status(404).json({ error: 'NOT_FOUND', message: '배송지를 찾을 수 없습니다' });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err, userId }, '배송지 수정 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 기본 배송지 설정
  router.patch('/:id/default', async (req: Request, res: Response) => {
    const userId = extractUserId(req, res, tokenService);
    if (!userId) return;

    const { id } = req.params;

    try {
      const existing = await addressRepository.findById(id, userId);
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: '배송지를 찾을 수 없습니다' });
        return;
      }
      await addressRepository.setDefault(id, userId);
      res.json({ message: '기본 배송지가 설정되었습니다' });
    } catch (err) {
      logger.error({ err, userId }, '기본 배송지 설정 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  // 배송지 삭제
  router.delete('/:id', async (req: Request, res: Response) => {
    const userId = extractUserId(req, res, tokenService);
    if (!userId) return;

    const { id } = req.params;

    try {
      const deleted = await addressRepository.delete(id, userId);
      if (!deleted) {
        res.status(404).json({ error: 'NOT_FOUND', message: '배송지를 찾을 수 없습니다' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      logger.error({ err, userId }, '배송지 삭제 실패');
      res.status(500).json({ error: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' });
    }
  });

  return router;
}
