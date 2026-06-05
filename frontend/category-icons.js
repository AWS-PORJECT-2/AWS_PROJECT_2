/**
 * 카테고리 아이콘 + doothing 브랜드 마크 헬퍼.
 *
 * 카테고리: /assets/jacket.png, tshirt.png, ecobag.png (개별 PNG, 중앙 정렬 정사각)
 * 브랜드:   /assets/right text renew.png (두띵 일러스트)
 *
 * PNG 로드 실패 시 인라인 SVG fallback.
 */

/* ===== 카테고리 아이콘 ===== */
// /assets/<key>.png 가 있으면 사용. 없으면(또는 로드 실패) 인라인 SVG 폴백.
// 신규 카테고리(후드티/폰케이스/스티커 등)는 이미지 추가 전까지 범용 폴백 표시.
const CATEGORY_ASSETS = {
  jacket: '/assets/jacket.png',
  tshirt: '/assets/tshirt.png',
  ecobag: '/assets/ecobag.png',
  hoodie: '/assets/hoodie.png',
  keyring: '/assets/keyring.png',
  phonecase: '/assets/phonecase.png',
  sticker: '/assets/sticker.png',
  badge: '/assets/badge.png',
  tumbler: '/assets/tumbler.png',
  fabric: '/assets/fabric.png',
  etc: '/assets/etc.png',
};

function categoryIconSvg(key) {
  var src = CATEGORY_ASSETS[key];
  if (!src) return categoryFallbackSvg(key);
  var fb = categoryFallbackSvg(key);
  return (
    '<img src="' + src + '" alt="' + escapeHtmlAttr(key) + '" ' +
    'style="width:100%;height:100%;object-fit:contain;display:block;" ' +
    'onerror="this.outerHTML=this.dataset.fb;" ' +
    'data-fb="' + escapeHtmlAttr(fb) + '">'
  );
}

function categoryFallbackSvg(key) {
  if (key === 'jacket') {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="jg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#c9a8eb"/><stop offset="100%" stop-color="#9d8be0"/></linearGradient></defs><path d="M28 48Q22 50 19 60L13 96Q12 104 20 106L34 108Q38 108 40 102L44 60Q43 50 36 47Z" fill="#fff" stroke="#c9a8eb" stroke-width="1.2"/><path d="M92 48Q98 50 101 60L107 96Q108 104 100 106L86 108Q82 108 80 102L76 60Q77 50 84 47Z" fill="#fff" stroke="#9d8be0" stroke-width="1.2"/><path d="M44 56Q44 50 50 48Q60 46 70 48Q76 50 76 56L78 102Q78 107 73 108L47 108Q42 107 42 102Z" fill="url(#jg)"/><path d="M52 38L60 48L68 38" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>';
  }
  if (key === 'tshirt') {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="tg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#B88AE0"/><stop offset="50%" stop-color="#70B9F2"/><stop offset="100%" stop-color="#86D9A6"/></linearGradient></defs><path fill="url(#tg)" d="M40 42L52 36Q60 42 68 36L80 42L96 56L86 64Q84 65 84 67L84 96Q84 100 80 100L40 100Q36 100 36 96L36 67Q36 65 34 64L24 56Z"/></svg>';
  }
  if (key === 'ecobag') {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="eg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5fb8d9"/><stop offset="100%" stop-color="#5fc9d9"/></linearGradient></defs><path d="M44 48Q44 26 60 26Q76 26 76 48" fill="none" stroke="url(#eg)" stroke-width="6.5" stroke-linecap="round"/><rect x="32" y="48" width="56" height="58" rx="3" fill="url(#eg)"/></svg>';
  }
  // 카테고리별 간단 라인 아이콘(연보라) — 실제 이미지(/assets/<key>.png) 추가 전까지 표시.
  var P = '#8b5cf6';
  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true">' +
      '<g fill="none" stroke="' + P + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">' + inner + '</g></svg>';
  }
  var ICONS = {
    hoodie:   '<path d="M38 44q22-16 44 0l10 16-12 8v36q0 4-4 4H44q-4 0-4-4V68l-12-8z"/><path d="M52 46v10q8 5 16 0V46"/>',
    keyring:  '<circle cx="44" cy="44" r="16"/><path d="M54 56l28 28m-10 0h12v-12" stroke-width="5"/>',
    phonecase:'<rect x="40" y="22" width="40" height="76" rx="9"/><circle cx="60" cy="34" r="3" fill="' + P + '"/>',
    sticker:  '<path d="M34 30h40q6 0 6 6v34l-22 20H40q-6 0-6-6z"/><path d="M80 70l-22 20v-14q0-6 6-6z"/>',
    badge:    '<circle cx="60" cy="58" r="26"/><circle cx="60" cy="58" r="10"/><path d="M60 84v14"/>',
    tumbler:  '<path d="M44 30h32l-4 64q-.5 6-6 6H54q-5.5 0-6-6z"/><path d="M42 44h36"/>',
    fabric:   '<rect x="28" y="40" width="64" height="44" rx="6"/><path d="M28 56q16 8 32 0t32 0"/>',
    etc:      '<circle cx="40" cy="60" r="5" fill="' + P + '"/><circle cx="60" cy="60" r="5" fill="' + P + '"/><circle cx="80" cy="60" r="5" fill="' + P + '"/>',
    webapp:   '<rect x="26" y="30" width="68" height="46" rx="5"/><path d="M26 42h68"/><circle cx="34" cy="36" r="1.6" fill="' + P + '"/><path d="M48 90h24M60 76v14"/>',
  };
  if (ICONS[key]) return svg(ICONS[key]);
  // 미상 key — 굿즈 박스
  return svg('<path d="M60 30 30 44v32l30 14 30-14V44z"/><path d="M30 44l30 14 30-14M60 58v32"/>');
}

/* ===== doothing 브랜드 마크 ===== */
var BRAND_IMAGE_SRC = '/assets/' + encodeURIComponent('right text renew') + '.png';

function brandMarkSvg() {
  var fb = brandFallbackSvg();
  return (
    '<img src="' + BRAND_IMAGE_SRC + '" alt="doothing" ' +
    'style="width:100%;height:100%;object-fit:contain;display:block;" ' +
    'onerror="this.outerHTML=this.dataset.fb;" ' +
    'data-fb="' + escapeHtmlAttr(fb) + '">'
  );
}

function brandFallbackSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 180" aria-hidden="true"><defs><linearGradient id="bg" x1="0%" y1="50%" x2="100%" y2="50%"><stop offset="0%" stop-color="#B88AE0"/><stop offset="50%" stop-color="#70B9F2"/><stop offset="100%" stop-color="#86D9A6"/></linearGradient></defs><text x="50" y="120" font-family="Pretendard,system-ui,sans-serif" font-size="86" font-weight="800" fill="url(#bg)" letter-spacing="-3">doothing</text></svg>';
}

/* ===== 유틸 ===== */
function escapeHtmlAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function createCategoryIcon(key, options) {
  options = options || {};
  var card = document.createElement('div');
  card.className = 'category-icon-card';
  if (options.size) { card.style.width = options.size; card.style.height = options.size; }
  card.innerHTML = categoryIconSvg(key);
  return card;
}

window.categoryIconSvg = categoryIconSvg;
window.brandMarkSvg = brandMarkSvg;
window.createCategoryIcon = createCategoryIcon;
