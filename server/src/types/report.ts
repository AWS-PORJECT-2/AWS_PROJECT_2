// 신고(report) 엔티티. (027_reports)
// 사용자가 메이커(maker) 또는 게시글(project=groupbuy)을 신고. 관리자가 처리.

/** 신고 대상 유형. 'maker'=메이커(유저), 'project'=게시글(groupbuy). */
export type ReportTargetType = 'maker' | 'project';

/** 신고 사유 카테고리. 'etc'(기타) 면 detail 필수. */
export type ReportReasonCategory =
  | 'spam'      // 스팸/광고
  | 'abuse'     // 욕설/비방
  | 'fraud'     // 사기/허위
  | 'sexual'    // 음란/부적절
  | 'copyright' // 저작권 침해
  | 'privacy'   // 개인정보 노출
  | 'etc';      // 기타(detail 필수)

/** 신고 처리 상태. */
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCategory: ReportReasonCategory;
  detail: string | null;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

export const REPORT_TARGET_TYPES: readonly ReportTargetType[] = ['maker', 'project'] as const;

export const REPORT_REASON_CATEGORIES: readonly ReportReasonCategory[] = [
  'spam', 'abuse', 'fraud', 'sexual', 'copyright', 'privacy', 'etc',
] as const;

export function isReportTargetType(v: unknown): v is ReportTargetType {
  return v === 'maker' || v === 'project';
}

export function isReportReasonCategory(v: unknown): v is ReportReasonCategory {
  return typeof v === 'string' && (REPORT_REASON_CATEGORIES as readonly string[]).includes(v);
}
