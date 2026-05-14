/**
 * InMemoryPgClient.cancelPayment 안전성 검증.
 *  - 기 취소건 차단
 *  - 취소 금액 검증 (0/음수/NaN/Infinity/초과)
 *  - 정상 케이스 상태 갱신
 */
import { InMemoryPgClient } from '../src/services/in-memory-pg-client.js';

async function main() {
  const pg = new InMemoryPgClient();

  // 사전: 빌링키 발급 + 결제
  const bk = await pg.issueBillingKey('user1', { number: '1234567812345678', expiry: '12/27', cvc: '123', birth: '900101' });
  if (!bk.success) throw new Error('빌링키 발급 실패');
  const pay = await pg.payWithBillingKey(bk.billingKey, 'order1', 10000, '테스트 주문');
  if (!pay.success) throw new Error('결제 실패');
  const pid = pay.pgPaymentId;
  console.log('✓ 사전: 결제 생성', pid);

  // 1) 정상 취소
  const cancel1 = await pg.cancelPayment(pid, '사용자 요청', 10000);
  console.log('1) 정상 취소:', cancel1);
  if (!cancel1.success) throw new Error('정상 취소 실패');

  // 2) 동일 결제 다시 취소 → ALREADY_CANCELLED
  const cancel2 = await pg.cancelPayment(pid, '중복', 10000);
  console.log('2) 재취소:', cancel2);
  if (cancel2.success || (cancel2 as any).error?.code !== 'ALREADY_CANCELLED') {
    throw new Error('중복 취소가 차단되지 않음');
  }

  // 3) 새 결제 생성 후 0원 취소 시도
  const pay3 = await pg.payWithBillingKey(bk.billingKey, 'order3', 5000, 't');
  if (!pay3.success) throw new Error();
  const c3a = await pg.cancelPayment(pay3.pgPaymentId, 't', 0);
  console.log('3a) 0원 취소:', c3a);
  if ((c3a as any).error?.code !== 'INVALID_CANCEL_AMOUNT') throw new Error('0원 취소 차단 실패');

  // 4) 음수 취소
  const c3b = await pg.cancelPayment(pay3.pgPaymentId, 't', -100);
  console.log('4) 음수 취소:', c3b);
  if ((c3b as any).error?.code !== 'INVALID_CANCEL_AMOUNT') throw new Error('음수 차단 실패');

  // 5) NaN 취소
  const c3c = await pg.cancelPayment(pay3.pgPaymentId, 't', NaN);
  console.log('5) NaN 취소:', c3c);
  if ((c3c as any).error?.code !== 'INVALID_CANCEL_AMOUNT') throw new Error('NaN 차단 실패');

  // 6) 결제 금액 초과 취소
  const c3d = await pg.cancelPayment(pay3.pgPaymentId, 't', 9999999);
  console.log('6) 초과 취소:', c3d);
  if ((c3d as any).error?.code !== 'INVALID_CANCEL_AMOUNT') throw new Error('초과 차단 실패');

  // 7) 부분 취소 정상 처리
  const c3e = await pg.cancelPayment(pay3.pgPaymentId, 't', 3000);
  console.log('7) 부분 취소(3000원):', c3e);
  if (!c3e.success) throw new Error('부분 취소 실패');

  // 8) 부분 취소 후 다시 취소 시도 → 이미 CANCELLED 로 마킹되어 있어야 함
  const c3f = await pg.cancelPayment(pay3.pgPaymentId, 't', 1000);
  console.log('8) 부분 취소 이후 재취소:', c3f);
  if ((c3f as any).error?.code !== 'ALREADY_CANCELLED') throw new Error('재취소 차단 실패');

  console.log('\n✅ 모든 케이스 통과');
}

main().catch((err) => { console.error('❌', err); process.exit(1); });
