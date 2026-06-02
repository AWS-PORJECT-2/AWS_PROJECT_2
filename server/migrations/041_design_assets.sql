-- 041: 디자인하기 라이브러리(무료 디자인 + 자수 패치). 관리자 CRUD + 에디터 picker.
--  image: 표시/삽입용 이미지 경로(/assets/library/...) 또는 data URL(관리자 업로드).
--  kind: 'free'(무료 디자인) | 'patch'(자수 패치). sort: 표시 순서.
CREATE TABLE IF NOT EXISTS design_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        VARCHAR(16) NOT NULL CHECK (kind IN ('free', 'patch')),
  name        VARCHAR(80) NOT NULL DEFAULT '',
  image       TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_assets_kind ON design_assets(kind, sort, created_at);

-- 시드(원본 제작 에셋 — 저작권 무관). 이미 시드돼 있으면(재실행) 중복 방지.
INSERT INTO design_assets (kind, name, image, sort)
SELECT * FROM (VALUES
  ('free','화살표(우)','/assets/library/free/arrow-right.png',0),
  ('free','화살표(상)','/assets/library/free/arrow-up.png',1),
  ('free','체크','/assets/library/free/check.png',2),
  ('free','원','/assets/library/free/circle-mint.png',3),
  ('free','구름','/assets/library/free/cloud.png',4),
  ('free','마름모','/assets/library/free/diamond.png',5),
  ('free','물방울','/assets/library/free/droplet.png',6),
  ('free','꽃','/assets/library/free/flower.png',7),
  ('free','하트(선)','/assets/library/free/heart-outline.png',8),
  ('free','하트(분홍)','/assets/library/free/heart-pink.png',9),
  ('free','하트(보라)','/assets/library/free/heart-purple.png',10),
  ('free','하트(빨강)','/assets/library/free/heart-red.png',11),
  ('free','육각형','/assets/library/free/hexagon.png',12),
  ('free','번개','/assets/library/free/lightning.png',13),
  ('free','오각형','/assets/library/free/pentagon.png',14),
  ('free','플러스','/assets/library/free/plus.png',15),
  ('free','링','/assets/library/free/ring.png',16),
  ('free','둥근사각','/assets/library/free/rsquare.png',17),
  ('free','둥근사각(선)','/assets/library/free/rsquare-outline.png',18),
  ('free','반짝임','/assets/library/free/sparkle.png',19),
  ('free','별(금)','/assets/library/free/star-gold.png',20),
  ('free','별(선)','/assets/library/free/star-outline.png',21),
  ('free','별(보라)','/assets/library/free/star-purple.png',22),
  ('free','해','/assets/library/free/sun.png',23),
  ('free','삼각형','/assets/library/free/triangle.png',24),
  ('free','엑스','/assets/library/free/xmark.png',25),
  ('patch','A 패치','/assets/library/patch/letter-A.png',0),
  ('patch','B 패치','/assets/library/patch/letter-B.png',1),
  ('patch','C 패치','/assets/library/patch/letter-C.png',2),
  ('patch','D 패치','/assets/library/patch/letter-D.png',3),
  ('patch','E 패치','/assets/library/patch/letter-E.png',4),
  ('patch','F 패치','/assets/library/patch/letter-F.png',5),
  ('patch','G 패치','/assets/library/patch/letter-G.png',6),
  ('patch','H 패치','/assets/library/patch/letter-H.png',7),
  ('patch','I 패치','/assets/library/patch/letter-I.png',8),
  ('patch','J 패치','/assets/library/patch/letter-J.png',9),
  ('patch','K 패치','/assets/library/patch/letter-K.png',10),
  ('patch','L 패치','/assets/library/patch/letter-L.png',11),
  ('patch','M 패치','/assets/library/patch/letter-M.png',12),
  ('patch','N 패치','/assets/library/patch/letter-N.png',13),
  ('patch','O 패치','/assets/library/patch/letter-O.png',14),
  ('patch','P 패치','/assets/library/patch/letter-P.png',15),
  ('patch','Q 패치','/assets/library/patch/letter-Q.png',16),
  ('patch','R 패치','/assets/library/patch/letter-R.png',17),
  ('patch','S 패치','/assets/library/patch/letter-S.png',18),
  ('patch','T 패치','/assets/library/patch/letter-T.png',19),
  ('patch','U 패치','/assets/library/patch/letter-U.png',20),
  ('patch','V 패치','/assets/library/patch/letter-V.png',21),
  ('patch','W 패치','/assets/library/patch/letter-W.png',22),
  ('patch','X 패치','/assets/library/patch/letter-X.png',23),
  ('patch','Y 패치','/assets/library/patch/letter-Y.png',24),
  ('patch','Z 패치','/assets/library/patch/letter-Z.png',25)
) AS seed(kind, name, image, sort)
WHERE NOT EXISTS (SELECT 1 FROM design_assets LIMIT 1);
