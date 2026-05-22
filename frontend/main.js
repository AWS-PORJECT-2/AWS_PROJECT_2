/**
 * doothing 메인 페이지 — Vanilla JS 컴포넌트.
 *
 * 컴포넌트 단위로 분리되어 있어 추후 React 마이그레이션 시 1:1 매핑 가능.
 * 각 컴포넌트는 (props) → HTMLElement 시그니처를 따른다.
 *
 * XSS 방어: 모든 사용자/외부 데이터는 textContent 로 렌더링 (innerHTML 미사용).
 */

/* ===== 더미 데이터 (추후 API 응답으로 교체) ===== */
const POPULAR_RANKING = [
  { rank: 1, name: '오버핏 과잠', seller: '디자인학부 학생회가 직접 디자인한 2026 신상 과잠. 부드러운 터치감과 따뜻한 보온성을 동시에.', emoji: 'jacket' },
  { rank: 2, name: '베이직 반팔티', seller: '코튼 100% 데일리 반팔. 어디에나 잘 어울리는 미니멀한 핏.', emoji: 'tshirt' },
  { rank: 3, name: '데일리 에코백', seller: '두꺼운 캔버스 원단으로 튼튼하게. 소속감을 가볍게 표현하는 한 끗.', emoji: 'ecobag' },
  { rank: 4, name: '스트릿 과잠', seller: '클래식한 디자인의 스트릿 감성 과잠.', emoji: 'jacket' },
  { rank: 5, name: '오버사이즈 반팔', seller: '루즈한 핏의 오버사이즈 반팔티.', emoji: 'tshirt' },
];

const NEW_PICKS = [
  { id: 1, name: '신규 과잠 에디션', emoji: 'jacket' },
  { id: 2, name: '레터링 반팔티', emoji: 'tshirt' },
  { id: 3, name: '미니멀 에코백', emoji: 'ecobag' },
  { id: 4, name: '컬러 매치 과잠', emoji: 'jacket' },
  { id: 5, name: '소프트 코튼 반팔', emoji: 'tshirt' },
];

/* ===== 이미지 path 매핑 (frontend/assets/ 에 추가하면 자동 노출) ===== */
const EMOJI_SRC = {
  jacket: 'assets/jacket.png',
  tshirt: 'assets/tshirt.png',
  ecobag: 'assets/ecobag.png',
};

/* ===== 헬퍼 ===== */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'onClick') node.addEventListener('click', v);
    else if (k === 'style') node.style.cssText = v;
    else if (k === 'href') node.setAttribute('href', v);
    else if (k === 'aria-label') node.setAttribute('aria-label', v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

function thumbWithFallback(emojiKey, label) {
  const wrap = el('div', { class: 'thumb' });
  const src = EMOJI_SRC[emojiKey];
  if (src) {
    const img = el('img', { src, alt: label || emojiKey });
    // 파일이 없을 때 깨진 이미지 숨김
    img.addEventListener('error', () => { img.style.display = 'none'; });
    wrap.appendChild(img);
  }
  return wrap;
}

/* =====================================================================
 * Component: Header
 * ===================================================================== */
function Header() {
  const left = el('nav', { class: 'nav-group' },
    el('button', { class: 'menu-btn', 'aria-label': '메뉴' }, '☰'),
    el('span', { class: 'brand' }, 'doothing'),
    el('a', { href: '#popular' }, '인기'),
    el('a', { href: '#new' }, '신규'),
  );
  const right = el('nav', { class: 'nav-group' },
    el('a', { href: '/design-select.html' }, '디자인하기'),
    el('a', { href: '/profile.html' }, '마이'),
    el('a', { href: '/settings.html' }, '설정'),
    el('a', { href: '/login-dev.html' }, '로그인'),
  );
  return el('header', { class: 'dt-header' }, left, right);
}

/* =====================================================================
 * Component: SearchBar
 * ===================================================================== */
function SearchBar({ placeholder = '어떤 의류를 찾으세요?' } = {}) {
  const input = el('input', {
    class: 'dt-search-input',
    type: 'text',
    placeholder,
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q) location.href = '/feed.html?q=' + encodeURIComponent(q);
    }
  });
  return el('div', { class: 'dt-search-wrap' }, input);
}

/* =====================================================================
 * Component: PopularSection
 *   - 좌측 메인 카드: 2초마다 1→2→3위 자동 전환
 *   - 우측: 1~5위 직렬 리스트
 *   - 좌측 카드 높이 = 우측 리스트 전체 높이 (flex stretch)
 * ===================================================================== */
function PopularSection({ ranking = POPULAR_RANKING, rotateMs = 2000 } = {}) {
  const main = el('div', { class: 'main-card' });
  const imageArea = el('div', { class: 'image-area' });
  const sellerText = el('p', { class: 'seller-text' });
  main.appendChild(imageArea);
  main.appendChild(sellerText);

  function renderMainAt(index) {
    const item = ranking[index];
    imageArea.textContent = '';
    const img = EMOJI_SRC[item.emoji]
      ? (() => {
          const i = el('img', { src: EMOJI_SRC[item.emoji], alt: item.name });
          i.addEventListener('error', () => { i.style.display = 'none'; });
          return i;
        })()
      : null;
    if (img) imageArea.appendChild(img);
    imageArea.appendChild(el('span', { class: 'rank-badge' }, '실시간 ' + item.rank + '위'));
    imageArea.appendChild(el('span', { class: 'item-name' }, item.name));
    sellerText.textContent = item.seller;
  }
  renderMainAt(0);

  // 1→2→3위 자동 순환
  let idx = 0;
  setInterval(() => {
    idx = (idx + 1) % Math.min(3, ranking.length);
    renderMainAt(idx);
  }, rotateMs);

  // 우측 직렬 1~5위
  const list = el('div', { class: 'rank-list' });
  ranking.slice(0, 5).forEach((item) => {
    const row = el('div', { class: 'rank-item' },
      el('span', { class: 'rank-num' }, String(item.rank)),
      thumbWithFallback(item.emoji, item.name),
      el('span', { class: 'name' }, item.name),
    );
    list.appendChild(row);
  });

  return el('section', { id: 'popular', class: 'dt-popular' }, main, list);
}

/* =====================================================================
 * Component: Slogan
 * ===================================================================== */
function Slogan({ lines = ['우리는 띄우고', '창작은 현실로'] } = {}) {
  const section = el('section', { class: 'dt-slogan' });
  lines.forEach((line, i) => {
    section.appendChild(document.createTextNode(line));
    if (i < lines.length - 1) section.appendChild(el('br'));
  });
  return section;
}

/* =====================================================================
 * Component: NewPicks
 * ===================================================================== */
function NewPicks({ items = NEW_PICKS, title = '신규픽' } = {}) {
  const grid = el('div', { class: 'grid' });
  items.forEach((item) => {
    const card = el('div', { class: 'card' },
      thumbWithFallback(item.emoji, item.name),
      el('p', null, item.name),
    );
    card.addEventListener('click', () => {
      location.href = '/detail.html?id=' + encodeURIComponent(item.id);
    });
    grid.appendChild(card);
  });
  return el('section', { id: 'new', class: 'dt-new-picks' },
    el('h2', null, title),
    grid,
  );
}

/* =====================================================================
 * App — 최종 조립
 * ===================================================================== */
function App() {
  document.body.classList.add('main-page');
  const root = document.getElementById('app') || document.body;
  root.appendChild(Header());
  root.appendChild(SearchBar());
  root.appendChild(PopularSection());
  root.appendChild(Slogan());
  root.appendChild(NewPicks());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', App);
} else {
  App();
}
