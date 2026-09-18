import { brandString } from '@deepseek-ai/dsh-brand'
import { Sub2apiError } from './errors.ts'
import type {
  Sub2apiAccountPaths,
  Sub2apiDeploymentFingerprint,
  Sub2apiGatewayAuthScheme,
  Sub2apiGatewayPaths,
  Sub2apiProtocolProfile,
  Sub2apiResponseEnvelope,
} from './types.ts'

/** Input accepted when a deployment-specific compatibility profile is composed. */
export interface Sub2apiProfileInput {
  readonly version: string
  readonly accountBaseUrl: string
  readonly gatewayBaseUrl: string
  readonly accountPaths: Sub2apiAccountPaths
  readonly gatewayPaths: Sub2apiGatewayPaths
  readonly accountResponseEnvelope?: Sub2apiResponseEnvelope
  readonly gatewayResponseEnvelope?: Sub2apiResponseEnvelope
  readonly gatewayAuthScheme?: Sub2apiGatewayAuthScheme
  /** Exact origins allowed to use HTTP for a development-only profile. */
  readonly allowInsecureHttpOrigins?: readonly string[]
}

/**
 * Normalize and validate one HTTPS/explicitly allowlisted HTTP origin.
 * @param value - origin text to validate.
 * @param allowInsecureHttpOrigins - exact development origins allowed to use HTTP.
 * @returns the normalized origin.
 */
export function normalizeSub2apiOrigin(value: string, allowInsecureHttpOrigins: readonly string[] = []): string {
  const url = parseBaseUrl(value, allowInsecureHttpOrigins)
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw profileError('an origin must not contain a path, query, or fragment')
  }
  assertAllowedProtocol(url, allowInsecureHttpOrigins)
  return url.origin
}

/**
 * Resolve a deployment profile while keeping endpoint paths and response envelopes explicit.
 * @param input - deployment origin, endpoint paths, and compatibility choices.
 * @returns an immutable normalized profile.
 */
export function resolveSub2apiProfile(input: Sub2apiProfileInput): Sub2apiProtocolProfile {
  if (input.version.trim() === '') throw profileError('profile version is required')
  const insecureOrigins = input.allowInsecureHttpOrigins ?? []
  const accountBaseUrl = normalizeApiBase(input.accountBaseUrl, insecureOrigins)
  const gatewayBaseUrl = normalizeApiBase(input.gatewayBaseUrl, insecureOrigins)
  const accountPaths = normalizeAccountPaths(input.accountPaths)
  const gatewayPaths = normalizeGatewayPaths(input.gatewayPaths)
  return Object.freeze({
    version: input.version,
    allowInsecureHttpOrigins: Object.freeze([...insecureOrigins]),
    accountBaseUrl,
    gatewayBaseUrl,
    account: Object.freeze({
      paths: Object.freeze(accountPaths),
      responseEnvelope: input.accountResponseEnvelope ?? 'both',
    }),
    gateway: Object.freeze({
      paths: Object.freeze(gatewayPaths),
      responseEnvelope: input.gatewayResponseEnvelope ?? 'direct',
      authScheme: input.gatewayAuthScheme ?? 'api-key',
    }),
  })
}

/**
 * Join one validated relative endpoint path to a normalized API base.
 * @param baseUrl - account or gateway API base URL.
 * @param path - absolute path relative to the base URL.
 * @param allowInsecureHttpOrigins - exact development origins allowed to use HTTP.
 * @returns the normalized endpoint URL.
 */
export function sub2apiUrl(baseUrl: string, path: string, allowInsecureHttpOrigins: readonly string[] = []): string {
  const normalizedBase = normalizeApiBase(baseUrl, allowInsecureHttpOrigins)
  return `${normalizedBase}${normalizePath(path)}`
}

/**
 * Brand a deployment fingerprint after validating its non-empty value.
 * @param value - deployment fingerprint to brand.
 * @returns the branded deployment fingerprint.
 */
export function sub2apiDeploymentFingerprint(value: string): Sub2apiDeploymentFingerprint {
  if (value.trim() === '') throw profileError('deployment fingerprint is required')
  return brandString<Sub2apiDeploymentFingerprint>(value)
}

function normalizeApiBase(value: string, allowInsecureHttpOrigins: readonly string[]): string {
  const url = parseBaseUrl(value, allowInsecureHttpOrigins)
  assertAllowedProtocol(url, allowInsecureHttpOrigins)
  const pathname = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${pathname === '/' ? '' : pathname}`
}

function parseBaseUrl(value: string, allowInsecureHttpOrigins: readonly string[]): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch (cause) {
    throw profileError('base URL is invalid', cause)
  }
  if (url.username !== '' || url.password !== '' || url.hostname === '') {
    throw profileError('base URL must not contain credentials and must include a host')
  }
  if (isUnsafeHostname(url.hostname)
    && !(url.protocol === 'http:' && allowInsecureHttpOrigins.includes(url.origin))) {
    throw profileError('base URL host is not allowed')
  }
  return url
}

function assertAllowedProtocol(url: URL, allowInsecureHttpOrigins: readonly string[]): void {
  if (url.protocol === 'https:') return
  if (url.protocol !== 'http:') throw profileError('base URL must use HTTPS')
  if (!allowInsecureHttpOrigins.includes(url.origin)) {
    throw profileError('HTTP is allowed only for an exact development origin')
  }
}

function normalizeAccountPaths(paths: Sub2apiAccountPaths): Sub2apiAccountPaths {
  return {
    login: normalizePath(paths.login),
    register: normalizePath(paths.register),
    ...(paths.loginTwoFactor === undefined ? {} : { loginTwoFactor: normalizePath(paths.loginTwoFactor) }),
    ...(paths.refresh === undefined ? {} : { refresh: normalizePath(paths.refresh) }),
    me: normalizePath(paths.me),
    apiKeys: normalizePath(paths.apiKeys),
    ...(paths.groupsAvailable === undefined ? {} : { groupsAvailable: normalizePath(paths.groupsAvailable) }),
    ...(paths.usage === undefined ? {} : { usage: normalizePath(paths.usage) }),
    ...(paths.recharge === undefined ? {} : { recharge: normalizePath(paths.recharge) }),
    ...(paths.publicSettings === undefined ? {} : { publicSettings: normalizePath(paths.publicSettings) }),
  }
}

function normalizeGatewayPaths(paths: Sub2apiGatewayPaths): Sub2apiGatewayPaths {
  return {
    models: normalizePath(paths.models),
    chatCompletions: normalizePath(paths.chatCompletions),
  }
}

function normalizePath(value: string): string {
  if (value === '' || !value.startsWith('/') || value.startsWith('//') || value.includes('?') || value.includes('#')) {
    throw profileError('endpoint paths must be absolute paths without query or fragment')
  }
  return value.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
}

function isUnsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host.includes(':')) return isUnsafeIpv6(host)
  const octets = host.split('.')
  if (octets.length !== 4 || octets.some(octet => !/^\d+$/.test(octet))) return false
  const values = octets.map(Number)
  return isUnsafeIpv4(values)
}

function isUnsafeIpv4(values: readonly number[]): boolean {
  if (values.length !== 4 || values.some(value => value < 0 || value > 255)) return true
  const first = values[0] ?? -1
  const second = values[1] ?? -1
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19 || second === 51))
    || (first === 203 && second === 0)
}

function isUnsafeIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (host === '::' || host === '::1' || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host) || /^ff/i.test(host)) return true
  const words = parseIpv6Words(host)
  if (words === undefined || words.length !== 8) return false
  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = words
  if (first !== 0 || second !== 0 || third !== 0 || fourth !== 0 || fifth !== 0 || sixth !== 0xffff) return false
  return isUnsafeIpv4([
    (seventh ?? -1) >> 8,
    (seventh ?? -1) & 0xff,
    (eighth ?? -1) >> 8,
    (eighth ?? -1) & 0xff,
  ])
}

function parseIpv6Words(hostname: string): readonly number[] | undefined {
  const halves = hostname.split('::')
  if (halves.length > 2) return undefined
  const left = parseIpv6Half(halves[0] ?? '')
  const right = halves.length === 2 ? parseIpv6Half(halves[1] ?? '') : []
  if (left === undefined || right === undefined) return undefined
  const missing = 8 - left.length - right.length
  if (halves.length === 1 && missing !== 0) return undefined
  if (halves.length === 2 && missing <= 0) return undefined
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

function parseIpv6Half(value: string): readonly number[] | undefined {
  if (value === '') return []
  const parts = value.split(':')
  const words: number[] = []
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return undefined
    words.push(Number.parseInt(part, 16))
  }
  return words
}

function profileError(message: string, cause?: unknown): Sub2apiError {
  return new Sub2apiError('SUB2API_BAD_REQUEST', `sub2api profile: ${message}`, { cause })
}
