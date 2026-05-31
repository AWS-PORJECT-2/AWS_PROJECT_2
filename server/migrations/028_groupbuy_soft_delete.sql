-- 028_groupbuy_soft_delete
-- 관리자 삭제(soft delete) 표식. status='cancelled' 는 목표 미달 종료 등에도 쓰이므로,
-- 관리자 삭제를 별도로 구분하기 위해 deleted_at 컬럼을 둔다.
-- deleted_at IS NOT NULL 인 펀드는 상세/목록/검색/피드/추천 등 모든 사용자 조회에서 제외(404).
ALTER TABLE groupbuys ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 조회 쿼리는 대부분 deleted_at IS NULL 로 필터하므로 부분 인덱스로 살아있는 펀드만 인덱싱.
CREATE INDEX IF NOT EXISTS idx_groupbuys_alive ON groupbuys (created_at DESC) WHERE deleted_at IS NULL;
