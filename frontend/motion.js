/**
 * 사이트 공통 모션 라이브러리
 *
 * - .reveal 요소를 스크롤 진입 시 fade-in (Intersection Observer)
 * - .lift 요소에 호버 시 살짝 떠오르는 효과 (CSS 전이만 트리거, JS 불필요하지만 일관성 위해)
 * - 카드 클래스(.funding-card, .feed-item, .action-card) 자동으로 .reveal 적용
 *
 * 모든 페이지에서 <script src="motion.js"></script> 로 로드하면 자동 동작.
 */
(function () {
  if (typeof IntersectionObserver === 'undefined') return;

  // 자동으로 reveal 클래스 부여할 셀렉터
  const AUTO_REVEAL = [
    '.funding-card',
    '.feed-item',
    '.action-card',
    '.section-title-row',
    '.hero',
  ];

  function autoTagReveal() {
    AUTO_REVEAL.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el.classList.contains('reveal')) el.classList.add('reveal');
      });
    });
  }

  function observe() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal:not(.in-view)').forEach((el) => obs.observe(el));
  }

  // 초기 1회
  autoTagReveal();
  observe();

  // 동적으로 카드를 그리는 페이지(피드/검색 등)를 위해 MutationObserver
  const mo = new MutationObserver(() => {
    autoTagReveal();
    observe();
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
