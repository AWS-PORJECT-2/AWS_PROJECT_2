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
    // groupbuys/participations/orders 는 ON DELETE RESTRICT → 진행 이력 있으면 23503 throw(상위에서 처리)
    await this.pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
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
