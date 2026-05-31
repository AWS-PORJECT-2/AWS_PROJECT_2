import type pg from 'pg';
import type { Report, ReportStatus, ReportTargetType, ReportReasonCategory } from '../types/index.js';
import type { ReportRepository, ReportCreate, ReportAdminItem } from './report-repository.js';

function mapRow(row: Record<string, unknown>): Report {
  return {
    id: row.id as string,
    reporterId: row.reporter_id as string,
    targetType: row.target_type as ReportTargetType,
    targetId: row.target_id as string,
    reasonCategory: row.reason_category as ReportReasonCategory,
    detail: (row.detail as string | null) ?? null,
    status: row.status as ReportStatus,
    createdAt: new Date(row.created_at as string),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
    resolvedBy: (row.resolved_by as string | null) ?? null,
  };
}

/** 신고 저장소 PostgreSQL 구현. (027_reports) */
export class PgReportRepository implements ReportRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: ReportCreate): Promise<Report> {
    const res = await this.pool.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason_category, detail)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, reporter_id, target_type, target_id, reason_category, detail, status, created_at, resolved_at, resolved_by`,
      [input.reporterId, input.targetType, input.targetId, input.reasonCategory, input.detail ?? null],
    );
    return mapRow(res.rows[0]);
  }

  async listForAdmin(status?: ReportStatus): Promise<ReportAdminItem[]> {
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE r.status = $${params.length}`;
    }
    // 대상 라벨/신고자 닉네임은 best-effort 조인.
    //   - 신고자: 닉네임(없으면 name) — 이메일/실명 외 표시용만.
    //   - 대상 라벨: maker → 메이커 닉네임/이름, project → groupbuy 제목.
    //   id 타입 차이로 인한 조인 실패를 막기 위해 target_id 를 TEXT 로 캐스팅해 비교.
    const res = await this.pool.query(
      `SELECT r.id, r.target_type, r.target_id, r.reason_category, r.detail,
              r.status, r.created_at, r.resolved_at,
              COALESCE(NULLIF(TRIM(ru.nickname), ''), ru.name) AS reporter_nickname,
              CASE
                WHEN r.target_type = 'maker'   THEN COALESCE(NULLIF(TRIM(mu.nickname), ''), mu.name)
                WHEN r.target_type = 'project' THEN gb.title
                ELSE NULL
              END AS target_label
         FROM reports r
         LEFT JOIN "user" ru ON ru.id::text = r.reporter_id::text
         LEFT JOIN "user" mu ON r.target_type = 'maker'   AND mu.id::text = r.target_id::text
         LEFT JOIN groupbuys gb ON r.target_type = 'project' AND gb.id::text = r.target_id::text
         ${where}
        ORDER BY r.created_at DESC
        LIMIT 200`,
      params,
    );
    return res.rows.map((row) => ({
      id: row.id as string,
      targetType: row.target_type as ReportTargetType,
      targetId: row.target_id as string,
      targetLabel: (row.target_label as string | null) ?? null,
      reasonCategory: row.reason_category as ReportReasonCategory,
      detail: (row.detail as string | null) ?? null,
      status: row.status as ReportStatus,
      reporterNickname: (row.reporter_nickname as string | null) ?? null,
      createdAt: new Date(row.created_at as string),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : null,
    }));
  }

  async findById(id: string): Promise<Report | null> {
    const res = await this.pool.query(
      `SELECT id, reporter_id, target_type, target_id, reason_category, detail, status, created_at, resolved_at, resolved_by
         FROM reports WHERE id = $1`,
      [id],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  async resolve(id: string, status: 'resolved' | 'dismissed', adminId: string): Promise<Report | null> {
    // open 상태만 처리 — 이미 처리된 신고 재처리 방지(멱등).
    const res = await this.pool.query(
      `UPDATE reports
          SET status = $2, resolved_at = NOW(), resolved_by = $3
        WHERE id = $1 AND status = 'open'
        RETURNING id, reporter_id, target_type, target_id, reason_category, detail, status, created_at, resolved_at, resolved_by`,
      [id, status, adminId],
    );
    return res.rows.length ? mapRow(res.rows[0]) : null;
  }

  async countOpen(): Promise<number> {
    const res = await this.pool.query(`SELECT COUNT(*)::int AS c FROM reports WHERE status = 'open'`);
    return res.rows[0]?.c ?? 0;
  }
}
