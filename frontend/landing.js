/**
 * 두띵 랜딩 페이지 인터랙션
 * - 마우스 위치 → ambient glow CSS 변수
 * - 네비 스크롤 시 glassmorphism
 * - story 섹션: sticky 풀스크린 + 단계별 frame 교체 + 배경 색상 모핑
 */
(function () {
  // ========== 마우스 추적 그라데이션 ==========
  let mx = 50, my = 50;
  let rafId = null;
  document.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth) * 100;
    my = (e.clientY / window.innerHeight) * 100;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--mx', mx + '%');
      document.documentElement.style.setProperty('--my', my + '%');
      rafId = null;
    });
  });

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
      const progress = Math.max(0, Math.min(1, scrolled / total));
      const idx = Math.min(TOTAL - 1, Math.floor(progress * TOTAL));
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

  // ========== Hero 비주얼 마우스 따라 parallax ==========
  const heroVisual = document.querySelector('.hero-visual');
  if (heroVisual) {
    let raf2 = false;
    let mxh = 0, myh = 0;
    document.addEventListener('mousemove', (e) => {
      mxh = (e.clientX / window.innerWidth - 0.5) * 2;
      myh = (e.clientY / window.innerHeight - 0.5) * 2;
      if (raf2) return;
      raf2 = true;
      requestAnimationFrame(() => {
        const rotateY = mxh * 4;
        const rotateX = -myh * 3;
        heroVisual.style.transform =
          `perspective(1200px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;
        raf2 = false;
      });
    });
  }
})();
