/**
 * 카테고리 단일 소스(프론트). 대학교 굿즈 펀딩 중심 13종 + 기타.
 * type: 생성 플로우 분기용
 *   - 'apparel' : 의류 → AI 가상피팅(모델 착용)
 *   - 'goods'   : 굿즈 → AI 전시 이미지(제품을 진열/전시 모델처럼)
 *   - 'none'    : 기타·애매 → AI 생성 단계 없음
 *
 * key 는 아이콘 에셋(/assets/<key>.png) 및 fallback SVG 매칭에 사용(= slug).
 * ⚠️ 백엔드 server/src/constants/categories.ts 와 동기화 유지.
 */
(function () {
  var CATEGORIES = [
    { slug: 'jacket',    key: 'jacket',    label: '과잠',          type: 'apparel' },
    { slug: 'hoodie',    key: 'hoodie',    label: '후드티·맨투맨', type: 'apparel' },
    { slug: 'tshirt',    key: 'tshirt',    label: '반팔티',        type: 'apparel' },
    { slug: 'ecobag',    key: 'ecobag',    label: '에코백',        type: 'goods' },
    { slug: 'keyring',   key: 'keyring',   label: '키링·스트랩',   type: 'goods' },
    { slug: 'phonecase', key: 'phonecase', label: '폰케이스',      type: 'goods' },
    { slug: 'sticker',   key: 'sticker',   label: '스티커·문구',   type: 'goods' },
    { slug: 'badge',     key: 'badge',     label: '뱃지·배지',     type: 'goods' },
    { slug: 'tumbler',   key: 'tumbler',   label: '텀블러·머그',   type: 'goods' },
    { slug: 'fabric',    key: 'fabric',    label: '담요·패브릭',   type: 'goods' },
    { slug: 'doll',      key: 'doll',      label: '인형·마스코트', type: 'goods' },
    { slug: 'accessory', key: 'accessory', label: '액세서리',      type: 'goods' },
    { slug: 'etc',       key: 'etc',       label: '기타',          type: 'none' },
  ];

  window.DT_CATEGORIES = CATEGORIES;

  // slug → 카테고리 객체
  window.dtCategory = function (slug) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].slug === slug || CATEGORIES[i].label === slug) return CATEGORIES[i];
    }
    return null;
  };

  // slug → 생성 플로우 타입 ('apparel' | 'goods' | 'none'); 미지정/미상은 'none'
  window.dtCategoryType = function (slug) {
    var c = window.dtCategory(slug);
    return c ? c.type : 'none';
  };
})();
