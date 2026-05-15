import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../logger.js';

/**
 * 이메일 발송 모듈.
 *
 * 환경변수:
 *  - SMTP_HOST           (예: smtp.gmail.com / email-smtp.us-east-1.amazonaws.com)
 *  - SMTP_PORT           (예: 465 / 587)
 *  - SMTP_SECURE         (true / false)
 *  - SMTP_USER           (Gmail 계정 / SES SMTP credential username)
 *  - SMTP_PASS           (Gmail 앱 비밀번호 / SES SMTP credential password)
 *  - MAIL_FROM           (보내는 사람 헤더, 예: "두띵 <doothing@kookmin.ac.kr>")
 *  - MAIL_DRY_RUN=true   (개발 시 실제 발송 대신 콘솔 로그만)
 */

let _transporter: Transporter | null = null;
let _isDryRun = false;

function getTransporter(): Transporter | null {
  if (_transporter !== null) return _transporter;

  const dryRun = process.env.MAIL_DRY_RUN === 'true';
  if (dryRun) {
    _isDryRun = true;
    logger.info('Mailer: DRY_RUN 모드 — 실제 메일 미발송');
    // sendMail 호출 시 dry-run 분기 처리 - transporter 자체는 null 유지
    return null;
  }

  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !portStr || !user || !pass) {
    logger.warn('Mailer: SMTP 환경변수 미설정 — 자동으로 DRY_RUN 모드');
    _isDryRun = true;
    return null;
  }

  // === 포트 정밀 검증 ===
  // parseInt 가 NaN/0/음수/65535 초과 같은 비정상 값을 통과시키면
  // nodemailer.createTransport 가 만들어는 지지만 실제 발송 시 모두 실패.
  // 그래서 여기서 fail-safe 로 차단하고 DRY_RUN 으로 전환.
  const port = Number.parseInt(portStr, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    logger.warn(
      { portStr },
      'Mailer: SMTP_PORT 값이 유효하지 않습니다 (1~65535 정수 필요) — DRY_RUN 모드로 전환됨'
    );
    _isDryRun = true;
    return null;
  }

  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  logger.info({ host, port, secure }, 'Mailer: SMTP 트랜스포터 생성');
  return _transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * 단일 메일 발송. 실패 시 에러를 던지지 않고 false 반환 (한 명 실패가 전체 batch 멈추지 않도록).
 */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || '두띵(Doothing) <noreply@kookmin.ac.kr>';

  if (_isDryRun || !transporter) {
    logger.info({ to: msg.to, subject: msg.subject, from }, '[DRY_RUN] 메일 발송');
    return true;
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    logger.info({ to: msg.to, messageId: info.messageId, subject: msg.subject }, '메일 발송 성공');
    return true;
  } catch (err) {
    logger.error({ err, to: msg.to, subject: msg.subject }, '메일 발송 실패');
    return false;
  }
}

/**
 * 여러 명에게 병렬 발송. Promise.all 로 동시 처리하되 개별 실패는 무시.
 */
export async function sendMailBatch(messages: MailMessage[]): Promise<{ sent: number; failed: number }> {
  if (messages.length === 0) return { sent: 0, failed: 0 };

  logger.info({ count: messages.length }, '메일 batch 발송 시작');
  const results = await Promise.all(messages.map((m) => sendMail(m)));

  const sent = results.filter((r) => r === true).length;
  const failed = results.length - sent;
  logger.info({ sent, failed }, '메일 batch 발송 완료');
  return { sent, failed };
}

/**
 * 100% 펀딩 달성 알림 메일 생성.
 */
export function buildFundCompletedMail(toEmail: string, fundTitle: string): MailMessage {
  const subject = `[두띵] 축하합니다! '${fundTitle}' 펀딩이 100% 달성되어 제작이 확정되었습니다.`;

  const text = [
    '안녕하세요, 두띵(Doothing)입니다.',
    '',
    `학우님이 참여하신 '${fundTitle}' 펀딩이 목표를 달성했습니다!`,
    '이제 실제 제작 및 구매 절차가 진행될 예정입니다.',
    '자세한 일정은 마이페이지와 공지사항을 확인해 주세요.',
    '',
    '감사합니다.',
    '두띵(Doothing) 운영팀',
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <div style="text-align:center;padding:24px 0;border-bottom:2px solid #2563eb;margin-bottom:24px;">
        <h1 style="font-size:22px;font-weight:800;color:#2563eb;margin:0;">🎉 펀딩 달성!</h1>
      </div>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;">안녕하세요, 두띵(Doothing)입니다.</p>
      <p style="font-size:15px;line-height:1.7;">
        학우님이 참여하신 <strong style="color:#2563eb;">'${escapeHtml(fundTitle)}'</strong> 펀딩이 목표를 달성했습니다!
      </p>
      <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px 16px;margin:18px 0;border-radius:4px;font-size:14px;line-height:1.7;color:#1e3a8a;">
        이제 실제 제작 및 구매 절차가 진행될 예정입니다.<br>
        자세한 일정은 <strong>마이페이지</strong>와 <strong>공지사항</strong>을 확인해 주세요!
      </div>
      <p style="font-size:13px;color:#6b7280;line-height:1.6;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
        감사합니다.<br>두띵(Doothing) 운영팀
      </p>
    </div>
  `;

  return { to: toEmail, subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
