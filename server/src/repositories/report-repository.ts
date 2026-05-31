import type { Report, ReportStatus, ReportTargetType, ReportReasonCategory } from '../types/index.js';

/** 신고 생성 입력 — detail 은 선택('etc' 면 라우트에서 필수 검증). */
export interface ReportCreate {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCategory: ReportReasonCategory;
  detail?: string | null;
}

/**
 * 관리자 목록 1건 — 신고자 닉네임/대상 라벨을 best-effort 로 조인해 포함.
 * 개인정보 최소화: 신고자는 닉네임만(이메일/실명 제외), 대상은 표시 라벨(메이커명/프로젝트 제목)만.
 */
export interface ReportAdminItem {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string | null;
  reasonCategory: ReportReasonCategory;
  detail: string | null;
  status: ReportStatus;
  reporterNickname: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

/**
 * 신고 저장소 — 사용자가 생성, 관리자가 조회/처리. (027_reports)
 */
export interface ReportRepository {
  create(input: ReportCreate): Promise<Report>;
  /** 관리자 목록(상태 필터 선택, 최신순). 신고자 닉네임/대상 라벨 조인 포함. */
  listForAdmin(status?: ReportStatus): Promise<ReportAdminItem[]>;
  findById(id: string): Promise<Report | null>;
  /** open 상태 신고를 resolved/dismissed 로 처리. 처리된 행(없으면 null) 반환. */
  resolve(id: string, status: 'resolved' | 'dismissed', adminId: string): Promise<Report | null>;
  /** 미처리(open) 신고 수 — 관리자 배지용. */
  countOpen(): Promise<number>;
}
