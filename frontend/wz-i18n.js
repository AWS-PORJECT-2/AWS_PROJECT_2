/* =====================================================================
 * 두띵 — 경량 다국어(KO/EN) 런타임. 전역 window.WZI18N.
 *
 *  접근: localStorage 'wz_lang' ('ko'|'en', 기본 'ko'). EN 일 때만 동작.
 *  방식: 렌더된 DOM 의 텍스트 노드 + 일부 속성(placeholder/title/aria-label/value)을
 *        KO→EN 사전(window.WZ_I18N_DICT, wz-i18n-dict.js)으로 "정확 일치" 치환한다.
 *        앱이 JS 로 동적 렌더하므로 MutationObserver 로 이후 추가 노드도 번역.
 *  안전: 정확 일치만 치환(사용자 입력/이름/본문은 사전 키와 안 맞아 그대로 둠).
 *        SCRIPT/STYLE/TEXTAREA/contenteditable/입력기(.bd-rte__area 등)·[data-no-i18n] 제외.
 *  언어 전환: WZI18N.set(lang) → localStorage 저장 후 reload(KO 복원을 위해 단순·확실하게).
 * ===================================================================== */
(function () {
  if (window.WZI18N) return;

  var KEY = 'wz_lang';
  function getLang() {
    try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ko'; } catch (_) { return 'ko'; }
  }
  var DICT = window.WZ_I18N_DICT || {};
  var lang = getLang();

  // 번역 제외 컨테이너(사용자 입력/리치에디터/명시적 제외).
  var SKIP_SEL = '[data-no-i18n],[contenteditable="true"],.bd-rte__area';
  function inSkip(node) {
    var el = node.nodeType === 1 ? node : node.parentNode;
    return !!(el && el.closest && el.closest(SKIP_SEL));
  }
  function lookup(raw) {
    if (!raw) return null;
    var key = raw.trim();
    if (!key) return null;
    var en = DICT[key];
    if (!en || en === key) return null;
    return raw.replace(key, en); // 앞뒤 공백 보존
  }

  function translateTextNodes(root) {
    if (!root || !root.ownerDocument && root.nodeType !== 9 && root.nodeType !== 1) return;
    var doc = root.ownerDocument || document;
    var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !/[가-힣]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'OPTION') return NodeFilter.FILTER_REJECT;
        if (inSkip(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n, hits = [];
    while ((n = walker.nextNode())) { var r = lookup(n.nodeValue); if (r !== null) hits.push([n, r]); }
    for (var i = 0; i < hits.length; i++) hits[i][0].nodeValue = hits[i][1];
  }

  var ATTRS = ['placeholder', 'title', 'aria-label'];
  function translateAttrs(root) {
    if (!root || !root.querySelectorAll) {
      // 텍스트노드 등은 부모 엘리먼트로
      root = root && root.parentNode && root.parentNode.querySelectorAll ? root.parentNode : null;
      if (!root) return;
    }
    var sel = ATTRS.map(function (a) { return '[' + a + ']'; }).join(',');
    var els = root.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (inSkip(el)) continue;
      for (var j = 0; j < ATTRS.length; j++) {
        var a = ATTRS[j];
        if (el.hasAttribute(a)) { var v = el.getAttribute(a); var r = lookup(v); if (r !== null) el.setAttribute(a, r); }
      }
    }
    // 버튼형 input value
    var btns = root.querySelectorAll('input[type=submit],input[type=button]');
    for (var k = 0; k < btns.length; k++) { var bv = btns[k].value; var br = lookup(bv); if (br !== null) btns[k].value = br; }
    // root 자신이 속성 보유 엘리먼트인 경우도 처리
    if (root.nodeType === 1 && root.hasAttribute) {
      for (var m = 0; m < ATTRS.length; m++) { var aa = ATTRS[m]; if (root.hasAttribute(aa)) { var rv = lookup(root.getAttribute(aa)); if (rv !== null) root.setAttribute(aa, rv); } }
    }
  }

  function translate(root) {
    try { translateTextNodes(root); translateAttrs(root); } catch (_) { /* 무시 */ }
  }

  var observer = null;
  function startObserver() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var mu = muts[i];
        if (mu.type === 'childList') {
          for (var j = 0; j < mu.addedNodes.length; j++) {
            var node = mu.addedNodes[j];
            if (node.nodeType === 1) translate(node);
            else if (node.nodeType === 3) { var r = lookup(node.nodeValue); if (r !== null && !inSkip(node)) node.nodeValue = r; }
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function applyEn() {
    document.documentElement.setAttribute('lang', 'en');
    translate(document.body || document.documentElement);
    startObserver();
  }

  function init() {
    if (lang !== 'en') return; // KO 기본 — 아무것도 안 함
    DICT = window.WZ_I18N_DICT || DICT;
    if (document.body) applyEn();
    else document.addEventListener('DOMContentLoaded', applyEn);
  }

  // 언어 전환 — 저장 후 reload(EN→KO 복원을 단순·확실히).
  function set(next) {
    var v = next === 'en' ? 'en' : 'ko';
    try { localStorage.setItem(KEY, v); } catch (_) {}
    location.reload();
  }

  window.WZI18N = {
    get lang() { return getLang(); },
    set: set,
    t: function (ko) { return (getLang() === 'en' && DICT[ko]) ? DICT[ko] : ko; },
    apply: function () { if (getLang() === 'en') applyEn(); },
  };

  init();
})();
