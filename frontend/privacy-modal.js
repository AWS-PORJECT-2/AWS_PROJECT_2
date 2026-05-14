/**
 * 개인정보 처리방침 모달 — 어디서든 호출 가능한 헬퍼.
 *
 * 사용법:
 *   <script src="privacy-modal.js"></script>
 *   <a href="#" onclick="showPrivacyModal();return false;">개인정보 처리방침 보기</a>
 *
 * 또는 결제/회원가입 페이지의 동의 체크박스 라벨 클릭 시:
 *   document.getElementById('privacyLink').addEventListener('click', (e) => {
 *     e.preventDefault();
 *     showPrivacyModal();
 *   });
 */

(function () {
  let _modalEl = null;
  let _previousFocus = null;

  function ensureStyles() {
    if (document.getElementById('privacy-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'privacy-modal-styles';
    style.textContent = [
      '.privacy-modal-back {',
      '  position: fixed; inset: 0; background: rgba(15,23,42,0.55);',
      '  display: none; align-items: center; justify-content: center;',
      '  z-index: 9999; padding: 16px;',
      '}',
      '.privacy-modal-back.active { display: flex; }',
      '.privacy-modal-box {',
      '  background: #fff; width: 100%; max-width: 720px; max-height: 88vh;',
      '  border-radius: 16px; display: flex; flex-direction: column; overflow: hidden;',
      '  box-shadow: 0 20px 60px rgba(0,0,0,0.25);',
      '}',
      '.privacy-modal-head {',
      '  display: flex; justify-content: space-between; align-items: center;',
      '  padding: 16px 22px; border-bottom: 1px solid #e5e7eb;',
      '}',
      '.privacy-modal-head h2 { font-size: 17px; font-weight: 800; color: #1a1a1a; margin: 0; }',
      '.privacy-modal-close {',
      '  background: none; border: none; font-size: 24px; cursor: pointer;',
      '  color: #6b7280; line-height: 1;',
      '}',
      '.privacy-modal-body {',
      '  padding: 20px 22px 24px; overflow-y: auto; line-height: 1.85;',
      '  font-size: 14px; color: #374151;',
      '}',
      '.privacy-modal-body h3 {',
      '  font-size: 15px; font-weight: 800; color: #1a1a1a;',
      '  margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;',
      '}',
      '.privacy-modal-body h3:first-child { margin-top: 0; }',
      '.privacy-modal-body h4 { font-size: 13px; font-weight: 700; color: #1a1a1a; margin: 14px 0 6px; }',
      '.privacy-modal-body ul, .privacy-modal-body ol { padding-left: 22px; margin: 6px 0 12px; }',
      '.privacy-modal-body li { margin: 3px 0; line-height: 1.85; }',
      '.privacy-modal-body table {',
      '  width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0 14px;',
      '}',
      '.privacy-modal-body th, .privacy-modal-body td {',
      '  border: 1px solid #d1d5db; padding: 8px 10px; vertical-align: top; line-height: 1.7;',
      '}',
      '.privacy-modal-body th { background: #f3f4f6; font-weight: 700; text-align: left; }',
      '.privacy-modal-body .intro {',
      '  background: #f9fafb; border-left: 3px solid #2563eb;',
      '  padding: 10px 14px; border-radius: 4px; margin-bottom: 18px; font-size: 13px;',
      '}',
      '.privacy-modal-body .note { font-size: 12px; color: #6b7280; margin-top: 4px; }',
      '.privacy-modal-foot {',
      '  padding: 12px 22px; border-top: 1px solid #e5e7eb;',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '}',
      '.privacy-modal-foot .btn {',
      '  padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;',
      '  border: none; cursor: pointer;',
      '}',
      '.privacy-modal-foot .btn-primary { background: #2563eb; color: #fff; }',
      '.privacy-modal-foot .btn-primary:hover { background: #1d4ed8; }',
      '.privacy-modal-foot .btn-link {',
      '  background: none; color: #2563eb; padding: 9px 6px;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function buildContent() {
    const html = [
      '<div class="intro">',
      '국민대학교 공동구매 플랫폼 <strong>두띵(Doothing)</strong>은 「개인정보 보호법」, 「전자상거래 등에서의 소비자보호에 관한 법률」 등 ',
      '관련 법령을 준수하여 이용자의 개인정보를 안전하게 처리합니다.',
      '</div>',

      '<h3>1. 수집하는 개인정보의 항목</h3>',
      '<table><thead><tr><th style="width:30%">구분</th><th>항목</th></tr></thead><tbody>',
      '<tr><td>회원가입 (필수)</td><td>이름, 소속(학과/학번), 학교 이메일</td></tr>',
      '<tr><td>공동구매 참여 (필수)</td><td>수령인 이름, 연락처, 배송지 주소(우편번호, 도로명/지번, 상세주소)</td></tr>',
      '<tr><td>결제 (필수)</td><td>입금자명, 입금 금액, 주문번호 (※ 무통장 입금 — 카드/계좌 정보는 수집 안 함)</td></tr>',
      '<tr><td>자동 수집</td><td>접속 로그, IP 주소, 쿠키, 디바이스 정보</td></tr>',
      '</tbody></table>',

      '<h3>2. 수집 및 이용 목적</h3>',
      '<ul>',
      '<li><strong>회원 식별 및 본인 확인</strong> — 학교 이메일 기반 재학 확인</li>',
      '<li><strong>공동구매 참여 처리</strong> — 펀딩 참여, 사이즈/수량 옵션 관리</li>',
      '<li><strong>결제 대조</strong> — 입금자명·금액·주문번호 매칭 및 승인</li>',
      '<li><strong>상품 배송</strong> — 택배사 연동을 통한 발송, 운송장 생성</li>',
      '<li><strong>고객 상담 및 분쟁 처리</strong></li>',
      '<li><strong>법적 의무 이행</strong> — 관련 법령에 따른 거래 기록 보관</li>',
      '</ul>',

      '<h3>3. 개인정보의 제3자 제공</h3>',
      '<p>원칙적으로 동의 없이 외부에 제공하지 않으며, 다음의 경우에 한해 제공합니다.</p>',
      '<table><thead><tr><th>제공받는 자</th><th>제공 항목</th><th>이용 목적</th><th>보유 기간</th></tr></thead><tbody>',
      '<tr><td>택배사 (CJ대한통운, 우체국택배 등)</td><td>수령인 이름, 연락처, 배송지 주소</td><td>주문 상품 배송 및 추적</td><td>배송 완료 후 6개월</td></tr>',
      '</tbody></table>',
      '<p class="note">※ 법령상 의무가 있는 경우(수사·재판 등 적법한 절차) 관계 기관에 제공될 수 있습니다.</p>',

      '<h3>4. 개인정보의 보유 및 이용기간</h3>',
      '<p>회원 탈퇴 시 지체 없이 파기합니다. 다만, 다음 기록은 관련 법령에 따라 보존합니다.</p>',
      '<table><thead><tr><th>보존 항목</th><th>근거 법령</th><th>보존 기간</th></tr></thead><tbody>',
      '<tr><td>계약 또는 청약철회 등에 관한 기록</td><td>전자상거래법 제6조</td><td>5년</td></tr>',
      '<tr><td>대금결제 및 재화 등의 공급에 관한 기록</td><td>전자상거래법 제6조</td><td>5년</td></tr>',
      '<tr><td>소비자의 불만 또는 분쟁처리에 관한 기록</td><td>전자상거래법 제6조</td><td>3년</td></tr>',
      '<tr><td>표시·광고에 관한 기록</td><td>전자상거래법 제6조</td><td>6개월</td></tr>',
      '<tr><td>로그인 기록 등</td><td>통신비밀보호법 제15조의2</td><td>3개월</td></tr>',
      '</tbody></table>',

      '<h3>5. 개인정보의 파기 절차 및 방법</h3>',
      '<ul>',
      '<li>전자적 파일: 복원이 불가능한 기술적 방법으로 영구 삭제</li>',
      '<li>종이 문서: 분쇄기로 분쇄 또는 소각</li>',
      '<li>법령상 의무 보존이 끝난 즉시 파기</li>',
      '</ul>',

      '<h3>6. 이용자의 권리와 행사 방법</h3>',
      '<ul>',
      '<li>개인정보 <strong>열람</strong>·<strong>정정</strong>·<strong>삭제</strong>·<strong>처리정지</strong>를 요구할 수 있습니다.</li>',
      '<li>「설정 → 내 정보 관리」 메뉴에서 직접 가능하거나, 보호책임자에게 서면·이메일로 요청 시 지체 없이 처리됩니다.</li>',
      '<li>회원 탈퇴를 통해 동의 철회가 가능합니다.</li>',
      '</ul>',

      '<h3>7. 개인정보의 안전성 확보 조치</h3>',
      '<ul>',
      '<li>전송 구간 HTTPS/TLS 암호화</li>',
      '<li>데이터베이스 접근 통제 및 SSL 보안 연결 (AWS RDS)</li>',
      '<li>방화벽, 침입 차단·탐지 시스템 운영</li>',
      '<li>개인정보 취급 직원 최소화 및 정기 교육</li>',
      '</ul>',

      '<h3>8. 개인정보 보호책임자</h3>',
      '<table><tbody>',
      '<tr><th style="width:30%">담당</th><td>두띵(Doothing) 운영팀 (국민대학교 소프트웨어학부)</td></tr>',
      '<tr><th>이메일</th><td>cnrtnsms@kookmin.ac.kr</td></tr>',
      '</tbody></table>',
      '<p class="note">개인정보 침해 신고: 개인정보 침해신고센터 ☎ 118 / 개인정보 분쟁조정위원회 ☎ 1833-6972</p>',

      '<p class="note" style="margin-top:18px;">전체 내용은 <a href="/privacy.html" target="_blank" rel="noopener">개인정보 처리방침 전체보기</a>에서 확인할 수 있습니다.</p>',
    ].join('');
    return html;
  }

  function buildModal() {
    if (_modalEl) return _modalEl;
    ensureStyles();

    const back = document.createElement('div');
    back.className = 'privacy-modal-back';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-labelledby', 'privacyModalTitle');

    const box = document.createElement('div');
    box.className = 'privacy-modal-box';

    const head = document.createElement('div');
    head.className = 'privacy-modal-head';
    const title = document.createElement('h2');
    title.id = 'privacyModalTitle';
    title.textContent = '개인정보 수집 및 이용 동의 안내';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'privacy-modal-close';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', hidePrivacyModal);
    head.appendChild(title);
    head.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'privacy-modal-body';
    // 정적 HTML 컨텐츠 (사용자 입력 없음 → innerHTML 안전)
    body.innerHTML = buildContent();

    const foot = document.createElement('div');
    foot.className = 'privacy-modal-foot';
    const linkBtn = document.createElement('a');
    linkBtn.className = 'btn btn-link';
    linkBtn.href = '/privacy.html';
    linkBtn.target = '_blank';
    linkBtn.rel = 'noopener noreferrer';
    linkBtn.textContent = '전체보기';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = '확인';
    okBtn.addEventListener('click', hidePrivacyModal);
    foot.appendChild(linkBtn);
    foot.appendChild(okBtn);

    box.appendChild(head);
    box.appendChild(body);
    box.appendChild(foot);
    back.appendChild(box);

    // 배경 클릭 시 닫기
    back.addEventListener('click', (e) => {
      if (e.target === back) hidePrivacyModal();
    });

    document.body.appendChild(back);
    _modalEl = back;
    return back;
  }

  function showPrivacyModal() {
    const m = buildModal();
    _previousFocus = document.activeElement;
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const closeBtn = m.querySelector('.privacy-modal-close');
      if (closeBtn) closeBtn.focus();
    }, 0);
    document.addEventListener('keydown', _escHandler);
  }

  function hidePrivacyModal() {
    if (!_modalEl) return;
    _modalEl.classList.remove('active');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _escHandler);
    if (_previousFocus && typeof _previousFocus.focus === 'function') {
      _previousFocus.focus();
      _previousFocus = null;
    }
  }

  function _escHandler(e) {
    if (e.key === 'Escape') hidePrivacyModal();
  }

  // 전역 노출
  window.showPrivacyModal = showPrivacyModal;
  window.hidePrivacyModal = hidePrivacyModal;
})();
