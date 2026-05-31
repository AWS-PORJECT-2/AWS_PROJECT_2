// 서버 기반 알림 — 여러 이벤트에서 생성되고 사용자가 조회/읽음 처리. (024_notifications)
// type 은 자유 문자열(VARCHAR(40))이지만 실제 발행하는 값만 union 으로 좁혀 오타를 막는다.
export type NotificationType =
  | 'welcome'          // 첫 회원가입
  | 'fund_submitted'   // 게시글 작성 — 작성자 본인(심사 중)
  | 'creator_new_fund' // 게시글 작성 — 작성자를 팔로우한 사용자
  | 'backed'           // 펀딩 참여 — 후원자 본인
  | 'new_backer'       // 펀딩 참여 — 펀드 창작자
  | 'deadline_soon'    // 마감 임박(24~48h) — 후원자/창작자
  | 'fund_success'     // 펀딩 성공 — 창작자
  | 'fund_failed'      // 펀딩 무산 — 창작자
  | 'backed_success'   // 펀딩 성공 — 후원자
  | 'backed_failed'    // 펀딩 무산 — 후원자
  | 'scheduled_open'   // 공개예정 알림신청 프로젝트 오픈 — 구독자
  | 'fund_approved'    // 관리자 심사 승인(공개) — 창작자
  | 'fund_rejected'    // 관리자 심사 반려 — 창작자
  | 'fund_deleted'     // 관리자 펀드 삭제 — 창작자
  | 'deposit_confirmed'; // 입금 확인(참여 확정) — 후원자

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  fundId: string | null;
  isRead: boolean;
  createdAt: Date;
}
