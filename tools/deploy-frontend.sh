#!/usr/bin/env bash
# 프론트 운영 배포 — JS/CSS 를 압축·난독화(주석/공백 제거 + 내부변수 mangle, 전역/window.* 보존)
# 후 S3 업로드 + CloudFront 무효화. 깃 저장소의 원본(frontend/*.js)은 가독성 위해 그대로 둔다.
#
# 사전 설치(1회):  npm i -g terser clean-css-cli
# 사용:           tools/deploy-frontend.sh
#
# 주의: 운영에 올라가는 코드는 반드시 이 스크립트로 배포할 것(원본 .js 를 그대로 올리면 난독화가 풀림).
#       이미지/목업 등 assets 는 변경 시 별도로 `aws s3 sync frontend/assets/ ...` 로 올린다(여기선 코드만).
set -euo pipefail

FRONT="$(cd "$(dirname "$0")/../frontend" && pwd)"
BUCKET="doothing-frontend-631259293822"
DIST_ID="E1GIC4LLQI0H3L"
DIST="$(mktemp -d)"

echo "▸ JS 압축·난독화(terser: 주석 제거 + 내부변수 mangle, 전역 보존)"
for f in "$FRONT"/*.js; do
  out="$DIST/$(basename "$f")"
  terser "$f" --compress --mangle --comments false -o "$out"
  node --check "$out"   # 깨졌으면 즉시 중단
done

echo "▸ CSS 압축(clean-css)"
for f in "$FRONT"/*.css; do
  cleancss -o "$DIST/$(basename "$f")" "$f"
done

echo "▸ S3 업로드(JS/CSS=난독화본, HTML=원본) — Cache-Control: no-cache 로 항상 재검증(변경 즉시 반영)"
# no-cache = 캐시하되 사용 전 반드시 서버 재검증(ETag) → 변경분 즉시 반영, 동일분은 304(빠름).
# 목업/마스크(이미지)는 design.js 의 ?v= 쿼리로 캐시버스트하므로 장기 캐시여도 갱신 보장.
aws s3 sync "$DIST" "s3://$BUCKET/" --exclude "*" --include "*.js"  --content-type "application/javascript" --cache-control "no-cache" --only-show-errors
aws s3 sync "$DIST" "s3://$BUCKET/" --exclude "*" --include "*.css" --content-type "text/css" --cache-control "no-cache" --only-show-errors
aws s3 sync "$FRONT/" "s3://$BUCKET/" --exclude "*" --include "*.html" --cache-control "no-cache" --only-show-errors

echo "▸ CloudFront 무효화"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --query "Invalidation.Status" --output text
echo "✓ 배포 완료(코드 난독화 적용)."
