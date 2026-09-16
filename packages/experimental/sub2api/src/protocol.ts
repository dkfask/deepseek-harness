import { Sub2apiError } from './errors.ts'
import type { Sub2apiResponseEnvelope } from './types.ts'

/**
 * Parse one bounded JSON response and select the configured Sub2API envelope.
 * The input must already have been byte-limited by the HTTP client.
 *
 * @param body - bounded UTF-8 response text.
 * @param envelope - whether the deployment returns a direct value, a `data` wrapper, or either.
 * @returns the direct payload or the value held by the `data` field.
 */
export function parseSub2apiPayload(body: string, envelope: Sub2apiResponseEnvelope): unknown {
  let value: unknown
  try {
    value = JSON.parse(body) as unknown
  } catch (cause: unknown) {
    throw new Sub2apiError('SUB2API_BAD_RESPONSE', 'Sub2API returned invalid JSON', { cause })
  }

  if (envelope === 'direct') return value
  if (!isSub2apiRecord(value) || !Object.prototype.hasOwnProperty.call(value, 'data')) {
    throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API response did not contain the configured data field')
  }
  return value.data
}

/**
 * True when a value can carry a named Sub2API response field.
 * @param value - value to inspect.
 * @returns whether the value is a non-array object.
 */
export function isSub2apiRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
