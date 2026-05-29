import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../logger.js';

/**
 * 이메일 알림 서비스.
 * 펀딩 100% 달성 시 학교 메일로 알림 발송.
 *
 * 환경변수:
 * - SMTP_HOST: SMTP 서버 호스트 (예: smtp.gmail.com)
 * - SMTP_PORT: SMTP 포트 (기본 587)
 * - SMTP_USER: SMTP 인증 사용자
 * - SMTP_PASS: SMTP 인증 비밀번호
 * - SMTP_FROM: 발신자 이메일 (예: noreply@doothing.com)
 */

export interface EmailNotificationService {
  sendFundingCompleteNotification(params: {
    recipientEmail: string;
    recipientName: string;
    fundTitle: string;
    fundId: string;
    totalAmount: number;
    participantCount: number;
  }): Promise<boolean>;
}

export class NodemailerEmailService implements EmailNotificationService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      logger.warn('SMTP 환경변수 미설정 — 이메일 알림 비활성화');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    // 연결 확인
    this.transporter.verify().then(() => {
      logger.info('SMTP 연결 확인 완료');
    }).catch((err) => {
      logger.error({ err }, 'SMTP 연결 실패 — 이메일 알림이 작동하지 않을 수 있습니다');
    });
  }

  async sendFundingCompleteNotification(params: {
    recipientEmail: string;
    recipientName: string;
    fundTitle: string;
    fundId: string;
    totalAmount: number;
    participantCount: number;
  }): Promise<boolean> {
    if (!this.transporter) {
      logger.warn('SMTP 미설정 — 이메일 발송 건너뜀');
      return false;
    }

    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    const subject = `[두띵] 펀딩 달성 알림: ${params.fundTitle}`;
    const html = this.buildFundingCompleteHtml(params);

    try {
      await this.transporter.sendMail({
        from: `"두띵 알림" <${from}>`,
        to: params.recipientEmail,
        subject,
        html,
      });
      logger.info(
        { to: params.recipientEmail, fundId: params.fundId },
        '펀딩 달성 알림 이메일 발송 완료',
      );
      return true;
    } catch (err) {
      logger.error(
        { err, to: params.recipientEmail, fundId: params.fundId },
        '펀딩 달성 알림 이메일 발송 실패',
      );
      return false;
    }
  }

  private buildFundingCompleteHtml(params: {
    recipientName: string;
    fundTitle: string;
    fundId: string;
    totalAmount: number;
    participantCount: number;
  }): string {
    const formattedAmount = params.totalAmount.toLocaleString('ko-KR');
    return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px; color: white; text-align: center;">
    <h1 style="margin: 0 0 10px;">🎉 펀딩 100% 달성!</h1>
    <p style="margin: 0; font-size: 18px;">${params.fundTitle}</p>
  </div>
  <div style="padding: 30px 20px;">
    <p>${params.recipientName}님, 안녕하세요!</p>
    <p>참여하신 펀딩 <strong>"${params.fundTitle}"</strong>이(가) 목표 금액을 달성했습니다.</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0; color: #666;">총 모금액</td>
        <td style="padding: 12px 0; text-align: right; font-weight: bold;">${formattedAmount}원</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 0; color: #666;">참여 인원</td>
        <td style="padding: 12px 0; text-align: right; font-weight: bold;">${params.participantCount}명</td>
      </tr>
    </table>
    <p style="color: #666; font-size: 14px;">곧 제작이 시작됩니다. 진행 상황은 두띵 앱에서 확인하실 수 있습니다.</p>
  </div>
  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>본 메일은 두띵 서비스에서 자동 발송되었습니다.</p>
  </div>
</body>
</html>`.trim();
  }
}

/**
 * Null 구현 — SMTP 미설정 시 사용. 로그만 남기고 항상 false 반환.
 */
export class NullEmailService implements EmailNotificationService {
  async sendFundingCompleteNotification(): Promise<boolean> {
    logger.info('NullEmailService: 이메일 발송 건너뜀 (SMTP 미설정)');
    return false;
  }
}

export function createEmailService(): EmailNotificationService {
  if (process.env.SMTP_HOST) {
    return new NodemailerEmailService();
  }
  return new NullEmailService();
}
