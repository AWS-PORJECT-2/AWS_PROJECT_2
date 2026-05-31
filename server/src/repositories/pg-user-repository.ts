import type pg from 'pg';
import type { User, UserRole, NotificationPrefs, PublicProfile, ProfileBadge, UserSearchItem } from '../types/index.js';
import type { UserRepository, ProfilePatch } from './user-repository.js';

// notification_prefs (JSONB/문자열) → NotificationPrefs 안전 파싱
function parsePrefs(raw: unknown): NotificationPrefs {
  if (raw == null) return {};
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: NotificationPrefs = {};
    for (const k of ['message', 'projectUpdate', 'subscribedOpen', 'likedDeadline', 'follow', 'marketing'] as const) {
      if (typeof (obj as Record<string, unknown>)[k] === 'boolean') out[k] = (obj as Record<string, boolean>)[k];
    }
    return out;
  } catch {
    return {};
  }
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(user: User): Promise<User> {
    const result = await this.pool.query(
      `INSERT INTO "user" (id, email, name, school_domain, picture, role, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        user.id,
        user.email.toLowerCase(),
        user.name,
        user.schoolDomain,
        user.picture ?? null,
        user.role ?? 'USER',
        user.createdAt,
        user.lastLoginAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT * FROM "user" WHERE email = $1`,
      [email.toLowerCase()],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT * FROM "user" WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findBySlug(slug: string): Promise<User | null> {
    const result = await this.pool.query(`SELECT * FROM "user" WHERE slug = $1`, [slug]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE "user" SET last_login_at = NOW() WHERE id = $1`,
      [userId],
    );
  }

  async updateProfile(userId: string, data: ProfilePatch): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const col = (name: string, value: unknown) => { fields.push(`${name} = $${idx++}`); values.push(value); };

    if (data.name !== undefined) col('name', data.name);
    if (data.picture !== undefined) col('picture', data.picture);
    if (data.nickname !== undefined) col('nickname', data.nickname);
    if (data.phone !== undefined) col('phone', data.phone);
    if (data.realName !== undefined) col('real_name', data.realName);
    if (data.onboarded !== undefined) col('onboarded', data.onboarded);
    if (data.intro !== undefined) col('intro', data.intro);
    if (data.website !== undefined) col('website', data.website);
    if (data.coverUrl !== undefined) col('cover_url', data.coverUrl);
    if (data.themeColor !== undefined) col('theme_color', data.themeColor);
    if (data.slug !== undefined) col('slug', data.slug);

    if (fields.length === 0) return this.findById(userId);

    values.push(userId);
    const result = await this.pool.query(
      'UPDATE "user" SET ' + fields.join(', ') + ' WHERE id = $' + idx + ' RETURNING *',
      values,
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<NotificationPrefs> {
    // 기존 JSONB 에 부분 병합(전달된 키만 덮어씀). COALESCE 로 NULL 방어.
    const result = await this.pool.query(
      `UPDATE "user"
          SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || $1::jsonb
        WHERE id = $2
        RETURNING notification_prefs`,
      [JSON.stringify(prefs), userId],
    );
    if (result.rows.length === 0) return {};
    return parsePrefs(result.rows[0].notification_prefs);
  }

  async setConsent(userId: string, data: { marketingOptIn: boolean }): Promise<{ termsAgreedAt: Date; marketingOptIn: boolean }> {
    const result = await this.pool.query(
      `UPDATE "user" SET terms_agreed_at = NOW(), marketing_opt_in = $1
        WHERE id = $2
        RETURNING terms_agreed_at, marketing_opt_in`,
      [data.marketingOptIn, userId],
    );
    const row = result.rows[0];
    return {
      termsAgreedAt: new Date(row.terms_agreed_at as string),
      marketingOptIn: Boolean(row.marketing_opt_in),
    };
  }

  async searchByNameOrNickname(q: string): Promise<UserSearchItem[]> {
    const like = `%${q}%`;
    const result = await this.pool.query(
      `SELECT id, name, nickname, slug, picture
         FROM "user"
        WHERE name ILIKE $1 OR nickname ILIKE $1
        ORDER BY name ASC
        LIMIT 20`,
      [like],
    );
    return result.rows.map((r) => ({
      userId: r.id as string,
      name: r.name as string,
      nickname: (r.nickname as string | null) ?? null,
      slug: (r.slug as string | null) ?? null,
      picture: (r.picture as string | null) ?? null,
    }));
  }

  /**
   * 공개 프로필 + 집계. 한 번의 라운드트립으로 팔로워/팔로잉/후원자/프로젝트 수와
   * (viewer 가 있으면) 팔로우 여부까지 계산한다.
   * supporterCount = 그 메이커의 groupbuys 에 confirmed 후원자(distinct user). reward_orders +
   * 카드결제 participations 양쪽을 합집합으로 집계(없으면 0).
   */
  async getPublicProfile(idOrSlug: string, viewerId?: string): Promise<PublicProfile | null> {
    const byId = isUuid(idOrSlug);
    const whereCol = byId ? 'u.id = $1' : 'u.slug = $1';
    const params: unknown[] = [idOrSlug];
    let viewerParam = 'NULL';
    if (viewerId) { params.push(viewerId); viewerParam = '$2'; }

    const sql = `
      SELECT
        u.id, u.name, u.nickname, u.slug, u.intro, u.website, u.picture,
        u.cover_url, u.theme_color, u.created_at,
        (SELECT COUNT(*)::int FROM follows f WHERE f.creator_id = u.id)  AS follower_count,
        (SELECT COUNT(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count,
        (SELECT COUNT(*)::int FROM groupbuys g WHERE g.creator_id = u.id AND g.status <> 'rejected') AS project_count,
        (SELECT COUNT(*)::int FROM (
            SELECT ro.user_id FROM reward_orders ro
              JOIN groupbuys g ON g.id = ro.fund_id
             WHERE g.creator_id = u.id AND ro.status IN ('paid','confirmed')
            UNION
            SELECT p.user_id FROM participations p
              JOIN groupbuys g ON g.id = p.groupbuy_id
             WHERE g.creator_id = u.id AND p.status = 'confirmed'
          ) sup) AS supporter_count,
        CASE WHEN ${viewerParam}::uuid IS NULL THEN FALSE
             ELSE EXISTS (SELECT 1 FROM follows f WHERE f.creator_id = u.id AND f.follower_id = ${viewerParam}::uuid)
        END AS is_following
      FROM "user" u
      WHERE ${whereCol}
      LIMIT 1
    `;

    const result = await this.pool.query(sql, params);
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    const userId = r.id as string;
    const isMe = viewerId === userId;
    const projectCount = Number(r.project_count) || 0;
    const supporterCount = Number(r.supporter_count) || 0;
    const followerCount = Number(r.follower_count) || 0;

    return {
      userId,
      name: r.name as string,
      nickname: (r.nickname as string | null) ?? null,
      slug: (r.slug as string | null) ?? null,
      intro: (r.intro as string | null) ?? null,
      website: (r.website as string | null) ?? null,
      picture: (r.picture as string | null) ?? null,
      coverUrl: (r.cover_url as string | null) ?? null,
      themeColor: (r.theme_color as string | null) ?? null,
      followerCount,
      followingCount: Number(r.following_count) || 0,
      supporterCount,
      projectCount,
      isFollowing: Boolean(r.is_following) && !isMe,
      isMe,
      badges: buildBadges({ projectCount, supporterCount, followerCount }),
    };
  }

  async setRole(userId: string, role: User['role']): Promise<void> {
    await this.pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [role, userId]);
  }

  async delete(userId: string): Promise<void> {
    // 회원 탈퇴 시 연관 데이터를 빠짐없이 정리해 고아행을 남기지 않는다. FK 동작별로 처리:
    //  - CASCADE(자동): refresh_token, addresses, payment_methods, chat_rooms/messages, follows,
    //    comments(user_id), reward_orders(user_id) — 마지막 "user" 삭제 시 함께 제거된다.
    //  - FK 없음(직접 삭제 필수): project_likes, project_subscriptions, notifications, project_drafts, reports.
    //  - 레거시 RESTRICT(미사용 결제계열): refunds→payments→orders→participations — 자식부터 지워야 user 삭제 가능.
    //  - 본인 소프트삭제 펀드를 하드삭제하기 전, 그 펀드를 참조하는 FK없는 행(찜/구독/댓글/신고/알림)도 정리.
    const softFunds = 'SELECT id FROM groupbuys WHERE creator_id = $1 AND deleted_at IS NOT NULL';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1) FK 없는 본인 흔적 직접 삭제(없으면 찜/구독 수·알림이 탈퇴 후에도 잔존).
      await client.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM project_drafts WHERE user_id = $1', [userId]);
      // 본인이 신고한 건 + 본인(메이커)을 대상으로 한 신고 모두 정리(reports 는 FK 없음, target_id 도 UUID).
      await client.query('DELETE FROM reports WHERE reporter_id = $1 OR target_id = $1', [userId]);
      await client.query('DELETE FROM project_likes WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM project_subscriptions WHERE user_id = $1', [userId]);
      // 본인 메이커 프로필을 대상으로 한 타인 댓글(target_type='profile', target_id=내 userId)도 정리.
      //  (본인이 작성한 댓글은 comments.user_id ON DELETE CASCADE 로 user 삭제 시 함께 제거됨.)
      await client.query(`DELETE FROM comments WHERE target_type = 'profile' AND target_id = $1::text`, [userId]);

      // 2) 레거시 결제(미사용) RESTRICT 해소 — 자식(refunds/payments)부터 → orders → participations.
      //    payment_events 는 payments ON DELETE CASCADE 라 payments 삭제 시 함께 정리됨.
      await client.query('DELETE FROM refunds WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]);
      await client.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)', [userId]);
      await client.query('DELETE FROM orders WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM participations WHERE user_id = $1', [userId]);

      // 3) 본인 소프트삭제 펀드를 하드삭제하기 전, 그 펀드를 참조하는 FK없는 행 정리.
      await client.query(`DELETE FROM project_likes WHERE groupbuy_id IN (${softFunds})`, [userId]);
      await client.query(`DELETE FROM project_subscriptions WHERE groupbuy_id IN (${softFunds})`, [userId]);
      await client.query(`DELETE FROM comments WHERE target_type = 'fund' AND target_id IN (SELECT id::text FROM groupbuys WHERE creator_id = $1 AND deleted_at IS NOT NULL)`, [userId]);
      await client.query(`DELETE FROM reports WHERE target_type = 'project' AND target_id IN (${softFunds})`, [userId]);
      // NOTE: 그 펀드를 참조하는 '타 사용자' 알림(fund_id)은 일부러 지우지 않는다 — 024 알림 보존 설계 존중 +
      //  fund_id 단글링은 알림 클릭 시 상세가 '삭제됨' 으로 안전 처리. (탈퇴자 본인 알림은 위 user_id 삭제로 이미 정리됨.)
      // 소프트삭제 펀드를 참조하는 (타 사용자 포함) 레거시 결제행 정리 — orders/participations 의 groupbuy_id 가
      //  ON DELETE RESTRICT 라, 정리하지 않으면 아래 groupbuys 하드삭제가 막혀 탈퇴가 영구 차단된다.
      await client.query(`DELETE FROM refunds WHERE order_id IN (SELECT id FROM orders WHERE groupbuy_id IN (${softFunds}))`, [userId]);
      await client.query(`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE groupbuy_id IN (${softFunds}))`, [userId]);
      await client.query(`DELETE FROM orders WHERE groupbuy_id IN (${softFunds})`, [userId]);
      await client.query(`DELETE FROM participations WHERE groupbuy_id IN (${softFunds})`, [userId]);

      // 4) 소프트삭제 펀드 하드삭제(reward_orders.fund_id CASCADE 로 그 펀드의 모든 후원 함께 정리).
      //    활성 펀드(deleted_at IS NULL)는 절대 건드리지 않음 — 남아 있으면 user 삭제가 FK 로 막혀 상위 라우트가 409 로 흡수.
      await client.query('DELETE FROM groupbuys WHERE creator_id = $1 AND deleted_at IS NOT NULL', [userId]);

      // 5) 마지막으로 user 삭제 — 위 CASCADE FK 들이 함께 발동.
      await client.query('DELETE FROM "user" WHERE id = $1', [userId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listAll(limit = 500): Promise<User[]> {
    const res = await this.pool.query(
      'SELECT * FROM "user" ORDER BY created_at DESC LIMIT $1',
      [Math.min(Math.max(limit, 1), 2000)],
    );
    return res.rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      schoolDomain: row.school_domain as string,
      picture: row.picture as string | undefined,
      role: (row.role as UserRole | undefined) ?? 'USER',
      nickname: (row.nickname as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      realName: (row.real_name as string | null) ?? null,
      onboarded: (row.onboarded as boolean | undefined) ?? false,
      slug: (row.slug as string | null) ?? null,
      intro: (row.intro as string | null) ?? null,
      website: (row.website as string | null) ?? null,
      coverUrl: (row.cover_url as string | null) ?? null,
      themeColor: (row.theme_color as string | null) ?? null,
      notificationPrefs: parsePrefs(row.notification_prefs),
      termsAgreedAt: row.terms_agreed_at ? new Date(row.terms_agreed_at as string) : null,
      marketingOptIn: Boolean(row.marketing_opt_in),
      createdAt: new Date(row.created_at as string),
      lastLoginAt: new Date(row.last_login_at as string),
    };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// 메이커 배지 — 집계 수치에 따라 부여(가벼운 게이미피케이션). 프론트가 라벨/설명을 그대로 표시.
function buildBadges(stats: { projectCount: number; supporterCount: number; followerCount: number }): ProfileBadge[] {
  const badges: ProfileBadge[] = [];
  if (stats.projectCount >= 1) {
    badges.push({ key: 'maker', label: '메이커', desc: '공구를 개설한 창작자' });
  }
  if (stats.projectCount >= 5) {
    badges.push({ key: 'prolific', label: '활동 메이커', desc: '공구 5개 이상 개설' });
  }
  if (stats.supporterCount >= 10) {
    badges.push({ key: 'loved', label: '인기 메이커', desc: '후원자 10명 이상' });
  }
  if (stats.followerCount >= 10) {
    badges.push({ key: 'followed', label: '팔로워 보유', desc: '팔로워 10명 이상' });
  }
  return badges;
}
