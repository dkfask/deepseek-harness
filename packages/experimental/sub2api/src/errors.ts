import type { Sub2apiComplianceRequirement, Sub2apiErrorSummary } from './types.ts'

/** Stable error categories reserved by the Sub2API integration. */
export type Sub2apiErrorCode =
  | 'SUB2API_NOT_AUTHENTICATED'
  | 'SUB2API_REAUTH_REQUIRED'
  | 'SUB2API_2FA_REQUIRED'
  | 'SUB2API_2FA_UNSUPPORTED'
  | 'SUB2API_KEY_REQUIRED'
  | 'SUB2API_KEY_INVALID'
  | 'SUB2API_INSUFFICIENT_BALANCE'
  | 'SUB2API_FORBIDDEN'
  | 'SUB2API_ACCOUNT_UNAVAILABLE'
  | 'SUB2API_MODEL_UNAVAILABLE'
  | 'SUB2API_RATE_LIMITED'
  | 'SUB2API_TIMEOUT'
  | 'SUB2API_CANCELLED'
  | 'SUB2API_BAD_REQUEST'
  | 'SUB2API_BAD_RESPONSE'
  | 'SUB2API_SERVICE_UNAVAILABLE'
  | 'SUB2API_PROTOCOL_MISMATCH'
  | 'SUB2API_RECHARGE_UNAVAILABLE'
  | 'SUB2API_ADMIN_COMPLIANCE_REQUIRED'

/** Additional facts attached to a stable integration error. */
export interface Sub2apiErrorOptions {
  readonly cause?: unknown
  readonly httpStatus?: number
  readonly retryable?: boolean
  readonly retryAfterMs?: number
  readonly compliance?: Sub2apiComplianceRequirement
}

/** Classified failure that may safely cross a Host-to-UI error projection. */
export class Sub2apiError extends Error {
  override readonly name = 'Sub2apiError'

  /** Stable category used by callers and projections. */
  readonly code: Sub2apiErrorCode
  /** Upstream status when one was received. */
  readonly httpStatus: number | undefined
  /** Whether the operation may be retried by its owning policy. */
  readonly retryable: boolean
  /** Optional upstream retry delay in milliseconds. */
  readonly retryAfterMs: number | undefined
  /** Safe deployment metadata explaining an administrator compliance gate. */
  readonly compliance: Sub2apiComplianceRequirement | undefined

  /**
   * Create one classified Sub2API failure.
   * @param code - stable failure category.
   * @param message - redacted, correction-oriented diagnostic.
   * @param options - optional cause, upstream status, and retry policy.
   */
  constructor(code: Sub2apiErrorCode, message: string, options: Sub2apiErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.code = code
    this.httpStatus = options.httpStatus
    this.retryable = options.retryable ?? false
    this.retryAfterMs = options.retryAfterMs
    this.compliance = options.compliance
  }

  /**
   * Return the only error fields permitted in a Remote or settings projection.
   * @returns a redacted error summary.
   */
  toSummary(): Sub2apiErrorSummary {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.retryAfterMs === undefined ? {} : { retryAfterMs: this.retryAfterMs }),
      ...(this.compliance === undefined ? {} : { compliance: this.compliance }),
    }
  }
}

/**
 * Identify a classified Sub2API error without trusting an arbitrary object's code field.
 * @param value - caught value.
 * @returns whether the value is a Sub2apiError.
 */
export function isSub2apiError(value: unknown): value is Sub2apiError {
  return value instanceof Sub2apiError
}
