-- 039: 배송지 삭제/회원탈퇴 시 FK 위반으로 실패하던 버그 수정.
-- reward_orders.address_id / participations.address_id 가 addresses(id) 를 RESTRICT(기본)로 참조해,
-- 그 주소를 쓰는 주문이 있으면 주소 삭제(설정 배송지 삭제·회원탈퇴 cascade)가 막혀 500 이 났다.
-- → ON DELETE SET NULL 로 변경(주문 데이터는 유지하고 주소 참조만 NULL). address_id 는 이미 nullable.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname AS conname, rel.relname AS relname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE con.contype = 'f'
       AND rel.relname IN ('reward_orders', 'participations')
       AND con.confrelid = 'addresses'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.relname, r.conname);
  END LOOP;
  ALTER TABLE reward_orders  ADD CONSTRAINT reward_orders_address_id_fkey  FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL;
  ALTER TABLE participations ADD CONSTRAINT participations_address_id_fkey FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE SET NULL;
END $$;
