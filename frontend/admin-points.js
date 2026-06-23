/**
 * 관리자 · 포인트 관리 페이지 로직. (045_point_system)
 *
 * - 관리자 전용. 권한 검사는 서버(requireAdmin)가 수행하며, 비관리자는 403으로 거부된다.
 * - 모든 사용자/서버 데이터는 textContent(또는 DOM API)로만 렌더링한다 — innerHTML 보간 없음(XSS 방어).
 * - 포인트 잔액의 최종 진실은 서버다. 클라이언트 검증은 잘못된 호출을 줄이기 위한 최소 방어선.
 */
(function () {
  'use strict';

  var REASON_LABELS = {
    signup: '회원가입',
    first_post: '첫 게시글',
    first_comment: '첫 댓글',
    ai_blueprint: 'AI 도면 생성',
    ai_tryon: 'AI 가상피팅',
    refund_ai_blueprint: 'AI 도면 환불',
    refund_ai_tryon: 'AI 가상피팅 환불',
    admin_adjust: '관리자 조정',
  };
  var TYPE_LABELS = { earn: '적립', spend: '차감' };

  var currentUserId = '';

  function $(id) { return document.getElementById(id); }

  function showMsg(text, kind) {
    var el = $('msg');
    el.textContent = text;
    el.className = 'msg show ' + (kind || 'info');
  }
  function clearMsg() {
    var el = $('msg');
    el.textContent = '';
    el.className = 'msg';
  }

  function reasonLabel(reason) {
    return Object.prototype.hasOwnProperty.call(REASON_LABELS, reason) ? REASON_LABELS[reason] : (reason || '');
  }

  function fmtDateTime(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fmtNum(n) {
    var v = Number(n);
    return isNaN(v) ? '' : v.toLocaleString('ko-KR');
  }

  function renderBalance(points) {
    $('bal').textContent = (points === null || points === undefined) ? '-' : fmtNum(points);
  }

  function renderTransactions(txs) {
    var tbody = $('txs');
    tbody.textContent = '';
    if (!txs || !txs.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'muted';
      td.textContent = '거래 내역이 없습니다.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    txs.forEach(function (tx) {
      var tr = document.createElement('tr');

      var typeTd = document.createElement('td');
      typeTd.textContent = TYPE_LABELS[tx.type] || tx.type || '';
      tr.appendChild(typeTd);

      var reasonTd = document.createElement('td');
      reasonTd.textContent = reasonLabel(tx.reason);
      tr.appendChild(reasonTd);

      var amtTd = document.createElement('td');
      var amount = Number(tx.amount);
      if (!isNaN(amount)) {
        var signed = tx.type === 'spend' ? -Math.abs(amount) : Math.abs(amount);
        amtTd.textContent = (signed > 0 ? '+' : '') + fmtNum(signed);
        amtTd.className = tx.type === 'spend' ? 'spend' : 'earn';
      }
      tr.appendChild(amtTd);

      var balTd = document.createElement('td');
      balTd.textContent = fmtNum(tx.balanceAfter);
      tr.appendChild(balTd);

      var timeTd = document.createElement('td');
      timeTd.textContent = fmtDateTime(tx.createdAt);
      tr.appendChild(timeTd);

      tbody.appendChild(tr);
    });
  }

  function selectedMode() {
    var checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : 'delta';
  }

  function updateModeUI() {
    var mode = selectedMode();
    var label = $('amtLabel');
    var hint = $('amtHint');
    var input = $('amt');
    if (mode === 'delta') {
      label.textContent = '증감 금액 (양수=적립, 음수=차감, 0 제외)';
      hint.textContent = '정수만 입력하세요. 최종 검증은 서버가 수행합니다.';
      input.placeholder = '예: 100 또는 -50';
      input.removeAttribute('min');
    } else {
      label.textContent = '설정할 잔액 (0 이상의 정수)';
      hint.textContent = '입력한 값으로 잔액을 덮어씁니다. 최종 검증은 서버가 수행합니다.';
      input.placeholder = '예: 0 또는 500';
      input.setAttribute('min', '0');
    }
  }

  function handleError(err, action) {
    var status = err && err.status;
    var code = err && err.code;
    var message = err && err.message;
    var text;
    if (status === 403) {
      text = '권한이 없습니다 (관리자 전용).';
    } else if (status === 410 || code === 'USER_NOT_FOUND') {
      text = '대상 사용자를 찾을 수 없습니다.';
    } else if (message) {
      text = action + ' 실패: ' + message;
    } else {
      text = action + ' 실패' + (code ? ' [' + code + ']' : '');
    }
    showMsg(text, 'err');
  }

  async function lookupUser() {
    var uid = $('uid').value.trim();
    if (!uid) { showMsg('사용자 ID를 입력하세요.', 'err'); return; }
    showMsg('조회 중...', 'info');
    try {
      var data = await window.api.get('/admin/users/' + encodeURIComponent(uid) + '/points');
      currentUserId = uid;
      renderBalance(data && data.points);
      renderTransactions(data && data.transactions);
      clearMsg();
    } catch (err) {
      handleError(err, '조회');
    }
  }

  async function refreshView() {
    if (!currentUserId) return;
    try {
      var data = await window.api.get('/admin/users/' + encodeURIComponent(currentUserId) + '/points');
      renderBalance(data && data.points);
      renderTransactions(data && data.transactions);
    } catch (err) {
      // 새로고침 실패는 치명적이지 않음 — 콘솔에만 남김.
      console.error('새로고침 실패', err);
    }
  }

  async function applyAdjustment() {
    var uid = $('uid').value.trim();
    var mode = selectedMode();
    var reason = $('reason').value.trim();
    var raw = $('amt').value.trim();

    if (!uid) { showMsg('사용자 ID를 입력하세요.', 'err'); return; }
    if (!reason) { showMsg('사유는 필수입니다.', 'err'); return; }
    if (raw === '') { showMsg('금액 또는 잔액을 입력하세요.', 'err'); return; }

    var num = Number(raw);
    if (!Number.isInteger(num)) { showMsg('정수만 입력할 수 있습니다.', 'err'); return; }

    var body = { mode: mode, reason: reason };
    if (mode === 'delta') {
      if (num === 0) { showMsg('증감 금액은 0이 될 수 없습니다.', 'err'); return; }
      body.amount = num;
    } else {
      if (num < 0) { showMsg('설정할 잔액은 0 이상이어야 합니다.', 'err'); return; }
      body.balance = num;
    }

    showMsg('적용 중...', 'info');
    try {
      var data = await window.api.post('/admin/users/' + encodeURIComponent(uid) + '/points', body);
      showMsg('적용 완료. 새 잔액: ' + fmtNum(data && data.balanceAfter) + 'P', 'ok');
      $('amt').value = '';
      $('reason').value = '';
      currentUserId = uid;
      await refreshView();
    } catch (err) {
      handleError(err, '적용');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('lookup').addEventListener('click', lookupUser);
    $('apply').addEventListener('click', applyAdjustment);
    $('uid').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookupUser(); });
    document.querySelectorAll('input[name="mode"]').forEach(function (r) {
      r.addEventListener('change', updateModeUI);
    });
    updateModeUI();
  });
})();
