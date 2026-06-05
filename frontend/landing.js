/**
 * 두띵 랜딩 페이지 인터랙션
 * - 네비 스크롤 시 glassmorphism
 * - story 섹션: sticky 풀스크린 + 단계별 frame 교체 + 배경 색상 모핑
 */
(function () {
  // ========== 네비 스크롤 효과 ==========
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 30) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ========== Story 섹션 — 풀스크린 sticky + 단계별 typography ==========
  const storyTrack = document.getElementById('storyTrack');
  const storyBg = document.getElementById('storyBg');
  const storyFrames = document.querySelectorAll('.story-frame');
  const railFill = document.getElementById('storyRailFill');
  const railNum = document.getElementById('storyRailNum');

  const PALETTES = [
    { c1: '#fde68a', c2: '#fbcfe8', c3: '#c4b5fd', rot: 0 },
    { c1: '#a5b4fc', c2: '#c4b5fd', c3: '#7dd3fc', rot: 60 },
    { c1: '#fcd34d', c2: '#fb7185', c3: '#a78bfa', rot: 120 },
    { c1: '#6ee7b7', c2: '#67e8f9', c3: '#a5b4fc', rot: 200 },
    { c1: '#86efac', c2: '#fde68a', c3: '#fdba74', rot: 280 },
  ];

  if (storyTrack && storyFrames.length) {
    const TOTAL = storyFrames.length;
    let currentFrame = -1;

    function applyPalette(idx) {
      if (!storyBg || !PALETTES[idx]) return;
      const p = PALETTES[idx];
      storyBg.style.setProperty('--story-c1', p.c1);
      storyBg.style.setProperty('--story-c2', p.c2);
      storyBg.style.setProperty('--story-c3', p.c3);
      storyBg.style.setProperty('--story-rot', p.rot + 'deg');
    }

    function setActiveFrame(idx) {
      storyFrames.forEach((frame, i) => {
        frame.classList.toggle('active', i === idx);
        frame.classList.toggle('past', i < idx);
      });
      applyPalette(idx);
      if (railNum) railNum.textContent = String(idx + 1).padStart(2, '0');
      if (railFill) railFill.style.height = ((idx + 1) / TOTAL * 100) + '%';
    }

    function onStoryScroll() {
      const rect = storyTrack.getBoundingClientRect();
      const viewport = window.innerHeight;
      const total = rect.height - viewport;
      const scrolled = -rect.top;
      const progress = total > 0 ? Math.max(0, Math.min(1, scrolled / total)) : 0;
      const idx = Math.min(TOTAL - 1, Math.floor(progress * TOTAL));
      if (!Number.isFinite(idx)) return;
      if (idx !== currentFrame) {
        currentFrame = idx;
        setActiveFrame(idx);
      }
    }

    let storyRaf = false;
    window.addEventListener('scroll', () => {
      if (storyRaf) return;
      storyRaf = true;
      requestAnimationFrame(() => {
        onStoryScroll();
        storyRaf = false;
      });
    }, { passive: true });
    setActiveFrame(0);
  }
})();
