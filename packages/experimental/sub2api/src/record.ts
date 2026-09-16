import { brandString } from '@deepseek-ai/dsh-brand'
import { Sub2apiError } from './errors.ts'
import { normalizeSub2apiOrigin, sub2apiDeploymentFingerprint } from './profile.ts'
import type {
  Sub2apiGrantRecordRedacted,
  Sub2apiGrantRecordV1,
  Sub2apiSecret,
} from './types.ts'

/**
 * Create a branded secret without ever echoing its value in an error.
 * @param value - non-empty secret value.
 * @returns the branded secret.
 */
export function sub2apiSecret(value: string): Sub2apiSecret {
  if (value.length === 0) throw recordError('secret must not be empty')
  return brandString<Sub2apiSecret>(value)
}

/**
 * Parse one durable JSON value into the version-one grant record.
 * @param value - untrusted durable value.
 * @returns the validated version-one grant record.
 */
export function parseSub2apiGrantRecord(value: unknown): Sub2apiGrantRecordV1 {
  if (!isRecord(value) || value.version !== 1) throw recordError('record version is unsupported')
  const deployment = requireRecord(value.deployment, 'deployment')
  const account = requireRecord(value.account, 'account')
  const auth = requireRecord(value.auth, 'auth')
  const apiKey = requireRecord(value.apiKey, 'apiKey')
  const origin = normalizeSub2apiOrigin(requireString(deployment.origin, 'deployment.origin'))
  const fingerprint = sub2apiDeploymentFingerprint(requireString(deployment.fingerprint, 'deployment.fingerprint'))
  const userId = requireString(account.userId, 'account.userId')
  const email = optionalString(account.email, 'account.email')
  const displayName = optionalString(account.displayName, 'account.displayName')
  const refreshToken = auth.refreshToken === undefined ? undefined : sub2apiSecret(requireString(auth.refreshToken, 'auth.refreshToken'))
  const refreshTokenType = optionalString(auth.refreshTokenType, 'auth.refreshTokenType')
  const lastRefreshAt = optionalInteger(auth.lastRefreshAt, 'auth.lastRefreshAt')
  const secret = sub2apiSecret(requireString(apiKey.secret, 'apiKey.secret'))
  const id = optionalString(apiKey.id, 'apiKey.id')
  const apiKeyFingerprint = optionalString(apiKey.fingerprint, 'apiKey.fingerprint')
  const createdAt = optionalInteger(apiKey.createdAt, 'apiKey.createdAt')
  const record: Sub2apiGrantRecordV1 = {
    version: 1,
    deployment: { origin, fingerprint },
    account: {
      userId,
      ...(email === undefined ? {} : { email }),
      ...(displayName === undefined ? {} : { displayName }),
    },
    auth: {
      ...(refreshToken === undefined ? {} : { refreshToken }),
      ...(refreshTokenType === undefined ? {} : { refreshTokenType }),
      ...(lastRefreshAt === undefined ? {} : { lastRefreshAt }),
    },
    apiKey: {
      ...(id === undefined ? {} : { id }),
      name: requireString(apiKey.name, 'apiKey.name'),
      secret,
      ...(apiKeyFingerprint === undefined ? {} : { fingerprint: apiKeyFingerprint }),
      ...(createdAt === undefined ? {} : { createdAt }),
    },
    generation: requireInteger(value.generation, 'generation'),
    updatedAt: requireInteger(value.updatedAt, 'updatedAt'),
  }
  return record
}

/**
 * Return the durable record without any refresh or API-key secret.
 * @param record - validated grant record.
 * @returns a secret-free record projection.
 */
export function redactSub2apiGrantRecord(record: Sub2apiGrantRecordV1): Sub2apiGrantRecordRedacted {
  return {
    version: 1,
    deployment: { origin: record.deployment.origin, fingerprint: record.deployment.fingerprint },
    account: { ...record.account },
    auth: { hasRefreshToken: record.auth.refreshToken !== undefined },
    apiKey: {
      ...(record.apiKey.id === undefined ? {} : { id: record.apiKey.id }),
      name: record.apiKey.name,
      ...(record.apiKey.fingerprint === undefined ? {} : { fingerprint: record.apiKey.fingerprint }),
      ...(record.apiKey.createdAt === undefined ? {} : { createdAt: record.apiKey.createdAt }),
      configured: true,
    },
    generation: record.generation,
    updatedAt: record.updatedAt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw recordError(`${field} must be an object`)
  return value
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw recordError(`${field} must be a non-empty string`)
  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return requireString(value, field)
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw recordError(`${field} must be a non-negative integer`)
  return value
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  return requireInteger(value, field)
}

function recordError(message: string): Sub2apiError {
  return new Sub2apiError('SUB2API_BAD_RESPONSE', `sub2api grant: ${message}`)
}
