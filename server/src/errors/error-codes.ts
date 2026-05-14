export interface ErrorCodeDefinition { httpStatus: number; code: string; message: string; }

export const ErrorCodes = {
  INVALID_EMAIL_FORMAT: { httpStatus: 400, code: 'INVALID_EMAIL_FORMAT', message: '올바른 이메일 형식을 입력해주세요' },
  INVALID_EMAIL_DOMAIN: { httpStatus: 403, code: 'INVALID_EMAIL_DOMAIN', message: '허용된 학교 이메일 계정으로만 로그인 가능합니다' },
  MISSING_REQUIRED_FIELD: { httpStatus: 400, code: 'MISSING_REQUIRED_FIELD', message: '필수 필드가 누락되었습니다' },
  INVALID_STATE: { httpStatus: 400, code: 'INVALID_STATE', message: '로그인 세션이 만료되었습니다. 다시 시도해주세요' },
  AUTH_FAILED: { httpStatus: 401, code: 'AUTH_FAILED', message: 'Google 인증에 실패했습니다' },
  TOKEN_EXPIRED: { httpStatus: 401, code: 'TOKEN_EXPIRED', message: '인증이 만료되었습니다' },
  INVALID_REFRESH_TOKEN: { httpStatus: 401, code: 'INVALID_REFRESH_TOKEN', message: '다시 로그인해주세요' },
  NOT_AUTHENTICATED: { httpStatus: 401, code: 'NOT_AUTHENTICATED', message: '로그인이 필요합니다' },
  INVALID_TOKEN: { httpStatus: 401, code: 'INVALID_TOKEN', message: '유효하지 않은 인증입니다' },
  GOOGLE_UNAVAILABLE: { httpStatus: 500, code: 'GOOGLE_UNAVAILABLE', message: 'Google 서버에 연결할 수 없습니다' },
  AI_UNAVAILABLE: { httpStatus: 503, code: 'AI_UNAVAILABLE', message: 'AI 서버가 연결되어 있지 않습니다' },
  AI_TIMEOUT: { httpStatus: 504, code: 'AI_TIMEOUT', message: 'AI 생성이 시간 내에 완료되지 않았습니다' },
  FEATURE_UNAVAILABLE: { httpStatus: 503, code: 'FEATURE_UNAVAILABLE', message: '해당 기능은 아직 준비 중입니다' },
  INTERNAL_ERROR: { httpStatus: 500, code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다' },

  // Payment-related error codes
  GROUPBUY_NOT_FOUND: { httpStatus: 404, code: 'GROUPBUY_NOT_FOUND', message: '공동구매를 찾을 수 없습니다' },
  GROUPBUY_NOT_AVAILABLE: { httpStatus: 400, code: 'GROUPBUY_NOT_AVAILABLE', message: '참여할 수 없는 공동구매입니다' },
  GROUPBUY_EXPIRED: { httpStatus: 400, code: 'GROUPBUY_EXPIRED', message: '공동구매 마감 기한이 지났습니다' },
  ALREADY_PARTICIPATING: { httpStatus: 409, code: 'ALREADY_PARTICIPATING', message: '이미 참여 중인 공동구매입니다' },
  PARTICIPATION_NOT_FOUND: { httpStatus: 404, code: 'PARTICIPATION_NOT_FOUND', message: '참여 정보를 찾을 수 없습니다' },
  BILLING_KEY_FAILED: { httpStatus: 502, code: 'BILLING_KEY_FAILED', message: '빌링키 발급에 실패했습니다' },
  PAYMENT_FAILED: { httpStatus: 502, code: 'PAYMENT_FAILED', message: '결제에 실패했습니다' },
  INVALID_OPTIONS: { httpStatus: 400, code: 'INVALID_OPTIONS', message: '유효하지 않은 상품 옵션입니다' },
  INVALID_REFUND_AMOUNT: { httpStatus: 400, code: 'INVALID_REFUND_AMOUNT', message: '환불 금액이 유효하지 않습니다' },
  ORDER_NOT_FOUND: { httpStatus: 404, code: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다' },
  ORDER_NOT_REFUNDABLE: { httpStatus: 400, code: 'ORDER_NOT_REFUNDABLE', message: '환불할 수 없는 주문입니다' },
  INVALID_ORDER_STATUS: { httpStatus: 400, code: 'INVALID_ORDER_STATUS', message: '주문 상태가 작업에 맞지 않습니다' },
  INVALID_WEBHOOK_SIGNATURE: { httpStatus: 400, code: 'INVALID_WEBHOOK_SIGNATURE', message: '유효하지 않은 웹훅 서명입니다' },
  PRICE_MISMATCH: { httpStatus: 400, code: 'PRICE_MISMATCH', message: '가격 정보가 일치하지 않습니다' },

  // Payment method & address error codes
  PAYMENT_METHOD_NOT_FOUND: { httpStatus: 404, code: 'PAYMENT_METHOD_NOT_FOUND', message: '결제 수단을 찾을 수 없습니다' },
  ADDRESS_NOT_FOUND: { httpStatus: 404, code: 'ADDRESS_NOT_FOUND', message: '배송지를 찾을 수 없습니다' },
  CANNOT_DELETE_LAST_ADDRESS: { httpStatus: 400, code: 'CANNOT_DELETE_LAST_ADDRESS', message: '마지막 배송지는 삭제할 수 없습니다' },
  FORBIDDEN: { httpStatus: 403, code: 'FORBIDDEN', message: '접근 권한이 없습니다' },
  NO_PROOF_UPLOADED: { httpStatus: 400, code: 'NO_PROOF_UPLOADED', message: '입금 확인증이 업로드되지 않았습니다' },
  FUND_NOT_FOUND: { httpStatus: 404, code: 'FUND_NOT_FOUND', message: '해당 펀드를 찾을 수 없습니다' },
  FUND_CLOSED: { httpStatus: 400, code: 'FUND_CLOSED', message: '판매 중지된 펀드입니다' },
  INVALID_QUANTITY: { httpStatus: 400, code: 'INVALID_QUANTITY', message: '수량이 유효하지 않습니다' },
} as const satisfies Record<string, ErrorCodeDefinition>;

export type ErrorCode = keyof typeof ErrorCodes;
