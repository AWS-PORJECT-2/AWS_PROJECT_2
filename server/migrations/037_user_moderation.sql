-- 037: 관리자 사용자 관리 — 계정 상태(정지/차단/탈퇴) + 제재 이력.
-- status: ACTIVE(정상) | SUSPENDED(기간정지, suspended_until 까지) | BANNED(영구정지) | WITHDRAWN(관리자 강제탈퇴).
-- 기간정지는 suspended_until 경과 시 자동으로 다시 ACTIVE 취급(인증/로그인 게이트에서 lazy 처리).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS status_updated_by UUID;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_status_chk') THEN
    ALTER TABLE "user" ADD CONSTRAINT user_status_chk CHECK (status IN ('ACTIVE','SUSPENDED','BANNED','WITHDRAWN'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_user_status ON "user"(status);

-- 사용자별 제재/관리 이력(감사 추적). action: suspend|ban|unban|withdraw|restore|rename|role|warn|note|notify|force_logout.
-- admin_id 는 행위자(관리자). reason 은 사유, meta 는 부가정보(예: until, oldName, newRole).
CREATE TABLE IF NOT EXISTS user_moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL,
  admin_id UUID,
  action VARCHAR(20) NOT NULL,
  reason TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_modactions_target ON user_moderation_actions(target_user_id, created_at DESC);
