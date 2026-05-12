/**
 * 알림 센터 (Global Notification)
 * 모든 페이지에서 로드되어 동작합니다.
 * - 종 아이콘 클릭 → 알림 패널 동적 생성
 * - 예약 상품 중 100% 달성 → 결제 유도
 * - 진행 중 → 상세 페이지 이동
 *
 * 주의: HTML 보간 시 사용자 데이터는 반드시 escapeHTML 을 거친다.
 *   기본은 api.js 의 window.escapeHTML 을 사용하고, 미로드 시 아래 fallback 사용.
 */
if (typeof window.escapeHTML !== 'function') {
  window.escapeHTML = function (v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}

/* ===== 알림 패널 동적 생성 ===== */
function ensureNotificationPanel() {
  if (document.getElementById('notificationPanel')) return;

  const panel = document.createElement('div');
  panel.id = 'notificationPanel';
  panel.style.cssText = 'display:none;position:fixed;inset:0;z-index:600;';
  // 정적 마크업 — 사용자 데이터 없음.
  panel.innerHTML = `
    <div id="notifBackdrop" onclick="closeNotification()" style="position:absolute;inset:0;background:rgba(0,0,0,0.4);"></div>
    <div id="notifContent" style="position:absolute;top:0;right:0;width:100%;max-width:380px;height:100%;background:#fff;box-shadow:-4px 0 20px rgba(0,0,0,0.1);display:flex;flex-direction:column;transform:translateX(100%);transition:transform 0.3s ease;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #f0f0f0;">
        <h2 style="font-size:17px;font-weight:700;color:#1a1a1a;">알림 내역</h2>
        <button onclick="closeNotification()" aria-label="닫기" style="background:none;border:none;cursor:pointer;padding:6px;color:#6b7280;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div id="notifList" style="flex:1;overflow-y:auto;"></div>
    </div>
  `;
  document.body.appendChild(panel);
}

/* ===== 열기/닫기 ===== */
function openNotification() {
  ensureNotificationPanel();
  const panel = document.getElementById('notificationPanel');
  const content = document.getElementById('notifContent');
  panel.style.display = 'block';
  requestAnimationFrame(() => {
    content.style.transform = 'translateX(0)';
  });
  renderNotificationList();
}

function closeNotification() {
  const panel = document.getElementById('notificationPanel');
  const content = document.getElementById('notifContent');
  if (!panel) return;
  content.style.transform = 'translateX(100%)';
  setTimeout(() => {
    panel.style.display = 'none';
  }, 300);
}

/* ===== 알림 리스트 렌더링 ===== */
function renderNotificationList() {
  const container = document.getElementById('notifList');
  if (!container) return;

  const products = (typeof MOCK_PRODUCTS !== 'undefined' && Array.isArray(MOCK_PRODUCTS))
    ? MOCK_PRODUCTS : [];
  const esc = window.escapeHTML;

  // 예약한 상품만 필터링
  const reserved = products.filter((p) => p.isReserved === true);

  if (reserved.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#9ca3af;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5" style="margin:0 auto 16px;">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <p style="font-size:15px;font-weight:600;color:#6b7280;">알림이 없습니다</p>
        <p style="font-size:13px;margin-top:6px;">공구에 참여하면 알림을 받을 수 있어요</p>
      </div>
    `;
    return;
  }

  container.innerHTML = reserved
    .map((item) => {
      const rate = (typeof calcAchievementRate === 'function') ? calcAchievementRate(item) : 0;
      const isAchieved = rate >= 100;
      const size = localStorage.getItem('selectedSize_' + item.id) || 'Free';

      const id = encodeURIComponent(item.id);
      const title = esc(item.title);
      const imageUrl = esc(item.imageUrl);
      const safeSize = esc(size);
      const sizeForUrl = encodeURIComponent(size);

      if (isAchieved && !item.isPaid) {
        // 100% 달성 + 미결제 → 결제 유도
        return `
        <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;background:#fffbeb;">
          <div style="display:flex;gap:12px;align-items:center;">
            <div style="width:56px;height:56px;border-radius:10px;overflow:hidden;flex-shrink:0;">
              <img src="${imageUrl}" alt="${title}" style="width:100%;height:100%;object-fit:cover;">
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</div>
              <div style="font-size:12px;color:#f97316;font-weight:600;margin-top:4px;">🎉 100% 달성! 결제를 진행해 주세요</div>
            </div>
          </div>
          <div style="margin-top:10px;">
            <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
              <div style="height:100%;background:#f97316;border-radius:3px;width:100%;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;">
              <span style="font-size:11px;color:#f97316;font-weight:600;">${rate}% 달성</span>
              <span style="font-size:11px;color:#9ca3af;">사이즈: ${safeSize}</span>
            </div>
          </div>
          <a href="payment.html?id=${id}&size=${sizeForUrl}" style="display:block;margin-top:12px;padding:10px;border:none;border-radius:10px;background:#f97316;color:#fff;font-size:14px;font-weight:700;text-align:center;text-decoration:none;">결제하기</a>
        </div>`;
      } else if (item.isPaid) {
        // 결제 완료
        return `
        <a href="detail.html?id=${id}" style="display:flex;gap:12px;padding:16px 20px;border-bottom:1px solid #f0f0f0;text-decoration:none;color:inherit;align-items:center;">
          <div style="width:56px;height:56px;border-radius:10px;overflow:hidden;flex-shrink:0;">
            <img src="${imageUrl}" alt="${title}" style="width:100%;height:100%;object-fit:cover;">
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</div>
            <div style="font-size:12px;color:#16a34a;font-weight:600;margin-top:4px;">✅ 결제 완료</div>
          </div>
        </a>`;
      } else {
        // 진행 중
        return `
        <a href="detail.html?id=${id}" style="display:flex;gap:12px;padding:16px 20px;border-bottom:1px solid #f0f0f0;text-decoration:none;color:inherit;">
          <div style="width:56px;height:56px;border-radius:10px;overflow:hidden;flex-shrink:0;">
            <img src="${imageUrl}" alt="${title}" style="width:100%;height:100%;object-fit:cover;">
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</div>
            <div style="font-size:12px;color:#2563eb;margin-top:4px;">공구가 현재 ${rate}% 진행 중입니다</div>
            <div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;margin-top:6px;">
              <div style="height:100%;background:#2563eb;border-radius:2px;width:${Math.min(rate, 100)}%;"></div>
            </div>
          </div>
        </a>`;
      }
    })
    .join('');
}
