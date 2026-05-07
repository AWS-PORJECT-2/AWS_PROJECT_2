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
} as const satisfies Record<string, ErrorCodeDefinition>;

export type ErrorCode = keyof typeof ErrorCodes;
