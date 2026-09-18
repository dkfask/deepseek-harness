import { Sub2apiError } from './errors.ts'
import { sub2apiUrl } from './profile.ts'
import type { Sub2apiComplianceRequirement, Sub2apiProtocolProfile } from './types.ts'

/** The two URL bases owned by the Sub2API HTTP client. */
export type Sub2apiHttpBase = 'account' | 'gateway'

/** JSON request methods used by the account and gateway protocols. */
export type Sub2apiHttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

/** A credential that may be attached to exactly one protocol plane. */
export type Sub2apiHttpCredential =
  | { readonly kind: 'access-token'; readonly value: string }
  | { readonly kind: 'api-key'; readonly value: string }

/** One request before the client adds protocol authentication and JSON headers. */
export interface Sub2apiHttpRequest {
  readonly base: Sub2apiHttpBase
  readonly path: string
  readonly method: Sub2apiHttpMethod
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: unknown
  readonly credential?: Sub2apiHttpCredential
}

/** Fetch-compatible function injected by production transport or protocol fixtures. */
export type Sub2apiFetch = typeof globalThis.fetch

/** Validates a URL's resolved destination before that URL is contacted. */
export type Sub2apiDestinationValidator = (url: URL, signal: AbortSignal) => Promise<void>

/** Bounded transport options; all values are explicit rather than hidden defaults. */
export interface Sub2apiHttpClientOptions {
  readonly profile: Sub2apiProtocolProfile
  readonly maxResponseBytes: number
  readonly timeoutMs: number
  readonly maxRedirects: number
  /** Must resolve and pin the destination used by the actual connection. */
  readonly validateDestination: Sub2apiDestinationValidator
  /** Replaced by tests and replay fixtures; production uses the platform fetch. */
  readonly fetch?: Sub2apiFetch
}

/** Safe response data returned to the Host protocol parser. */
export interface Sub2apiHttpResponse {
  readonly status: number
  readonly url: string
  readonly contentType: string | undefined
  readonly retryAfterMs: number | undefined
  readonly body: string
}

const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key'])

/**
 * Send one bounded Sub2API request with manual, same-origin redirect handling.
 * The destination validator is called for the initial URL and every redirect
 * before the corresponding URL is contacted.
 */
export class Sub2apiHttpClient {
  private readonly fetch: Sub2apiFetch

  /**
   * @param options - protocol profile, resource limits, and connection validator.
   */
  constructor(private readonly options: Sub2apiHttpClientOptions) {
    assertPositiveInteger('maxResponseBytes', options.maxResponseBytes)
    assertPositiveFinite('timeoutMs', options.timeoutMs)
    if (options.timeoutMs > MAX_NODE_TIMER_DELAY_MS) {
      throw new Sub2apiError('SUB2API_BAD_REQUEST', `sub2api HTTP: timeoutMs must be no greater than ${MAX_NODE_TIMER_DELAY_MS}`)
    }
    assertNonNegativeInteger('maxRedirects', options.maxRedirects)
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  /**
   * Execute one account or gateway request and return only its bounded body.
   * @param request - endpoint, method, optional JSON body, and one protocol credential.
   * @param signal - caller cancellation signal.
   * @returns status, safe response metadata, and a bounded text body.
   */
  async request(request: Sub2apiHttpRequest, signal?: AbortSignal): Promise<Sub2apiHttpResponse> {
    const initialUrl = this.urlFor(request)
    assertRequestHeaders(request.headers)
    const encodedBody = encodeBody(request.body)
    const headers = this.headersFor(request)
    const deadline = createDeadline(signal, this.options.timeoutMs)
    try {
      let currentUrl = initialUrl
      let method = request.method
      let body = encodedBody
      for (let redirects = 0; ; redirects += 1) {
        await this.options.validateDestination(currentUrl, deadline.signal)
        if (deadline.signal.aborted) throw deadline.signal.reason ?? new Error('request aborted')
        const response = await this.fetch(currentUrl, {
          method,
          headers,
          ...(body === undefined ? {} : { body }),
          redirect: 'manual',
          signal: deadline.signal,
        })

        if (REDIRECT_STATUSES.has(response.status)) {
          if (redirects >= this.options.maxRedirects) {
            await cancelBody(response)
            throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API returned too many redirects', { httpStatus: response.status })
          }
          const location = response.headers.get('location')
          if (location === null) {
            await cancelBody(response)
            throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API returned a redirect without a location', { httpStatus: response.status })
          }
          let target: URL
          try {
            target = redirectTarget(location, currentUrl, initialUrl)
          } catch (error: unknown) {
            await cancelBody(response)
            throw error
          }
          await cancelBody(response)
          currentUrl = target
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== 'GET')) {
            method = 'GET'
            body = undefined
          }
          continue
        }

        if (response.status < 200 || response.status >= 300) {
          const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
          const body = await readBoundedBody(response, this.options.maxResponseBytes, deadline.signal)
          throw mapHttpStatus(request, response.status, retryAfterMs, parseErrorDescriptor(body))
        }

        return {
          status: response.status,
          url: response.url === '' ? currentUrl.toString() : response.url,
          contentType: response.headers.get('content-type') ?? undefined,
          retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
          body: await readBoundedBody(response, this.options.maxResponseBytes, deadline.signal),
        }
      }
    } catch (error: unknown) {
      throw translateTransportError(error, signal, deadline)
    } finally {
      deadline.dispose()
    }
  }

  /**
   * Create the fetch implementation used by the LLM provider. It validates the
   * resolved URL before every connection and disables implicit redirect
   * following, so provider requests cannot bypass the account/gateway target
   * policy through pi-ai's direct transport.
   * @returns a fetch function suitable for pi-ai provider options.
   */
  createValidatedFetch(): Sub2apiFetch {
    return async (input, init) => {
      const target = fetchTarget(input)
      const fallbackSignal = new AbortController().signal
      const signal = init?.signal ?? fallbackSignal
      await this.options.validateDestination(target, signal)
      if (signal.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
      return this.fetch(input, { ...init, redirect: 'manual' })
    }
  }

  private urlFor(request: Sub2apiHttpRequest): URL {
    const baseUrl = request.base === 'account' ? this.options.profile.accountBaseUrl : this.options.profile.gatewayBaseUrl
    return new URL(sub2apiUrl(baseUrl, request.path, this.options.profile.allowInsecureHttpOrigins))
  }

  private headersFor(request: Sub2apiHttpRequest): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...request.headers,
    }
    if (request.credential === undefined) return headers
    if (request.base === 'account' && request.credential.kind !== 'access-token') {
      throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API account requests require an access token')
    }
    if (request.base === 'gateway' && request.credential.kind !== 'api-key') {
      throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API gateway requests require an API Key')
    }
    if (request.credential.kind === 'access-token') {
      headers.authorization = `Bearer ${request.credential.value}`
    } else if (this.options.profile.gateway.authScheme === 'bearer') {
      headers.authorization = `Bearer ${request.credential.value}`
    } else {
      headers['x-api-key'] = request.credential.value
    }
    return headers
  }
}

function fetchTarget(input: RequestInfo | URL): URL {
  if (input instanceof URL) return new URL(input)
  if (typeof input === 'string') return new URL(input)
  return new URL(input.url)
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Sub2apiError('SUB2API_BAD_REQUEST', `sub2api HTTP: ${name} must be a positive integer`)
  }
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Sub2apiError('SUB2API_BAD_REQUEST', `sub2api HTTP: ${name} must be a positive finite number`)
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Sub2apiError('SUB2API_BAD_REQUEST', `sub2api HTTP: ${name} must be a non-negative integer`)
  }
}

function assertRequestHeaders(headers: Readonly<Record<string, string>> | undefined): void {
  for (const name of Object.keys(headers ?? {})) {
    if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
      throw new Sub2apiError('SUB2API_BAD_REQUEST', `Sub2API request header ${name} is reserved`)
    }
  }
}

function encodeBody(body: unknown): string | undefined {
  if (body === undefined) return undefined
  try {
    const encoded: unknown = JSON.stringify(body)
    if (typeof encoded !== 'string') throw new Error('body is not JSON serializable')
    return encoded
  } catch (cause: unknown) {
    throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API request body is not JSON serializable', { cause })
  }
}

function redirectTarget(location: string, current: URL, initial: URL): URL {
  let target: URL
  try {
    target = new URL(location, current)
  } catch (cause: unknown) {
    throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API returned an invalid redirect location', { cause })
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API redirect used an unsupported URL scheme')
  }
  if (target.username !== '' || target.password !== '') {
    throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API redirect contained URL credentials')
  }
  if (target.origin !== initial.origin) {
    throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API redirect crossed deployment origins')
  }
  return target
}

async function readBoundedBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await cancelBody(response)
    throw new Sub2apiError('SUB2API_BAD_RESPONSE', 'Sub2API response exceeded the configured size limit')
  }
  if (response.body === null) return ''
  const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal.aborted) throw signal.reason ?? new Error('request aborted')
      if (total + value.byteLength > maxBytes) {
        await reader.cancel()
        throw new Sub2apiError('SUB2API_BAD_RESPONSE', 'Sub2API response exceeded the configured size limit')
      }
      chunks.push(value)
      total += value.byteLength
    }
  } catch (cause: unknown) {
    if (cause instanceof Sub2apiError) throw cause
    if (signal.aborted) throw cause
    throw new Sub2apiError('SUB2API_SERVICE_UNAVAILABLE', 'Sub2API response could not be read', { cause, retryable: true })
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

async function cancelBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

interface Sub2apiErrorDescriptor {
  readonly code?: string
  readonly compliance?: Sub2apiComplianceRequirement
}

function mapHttpStatus(
  request: Sub2apiHttpRequest,
  status: number,
  retryAfterMs: number | undefined,
  descriptor: Sub2apiErrorDescriptor | undefined,
): Sub2apiError {
  const retryOptions = retryAfterMs === undefined
    ? { httpStatus: status }
    : { httpStatus: status, retryAfterMs }
  if (status === 423 && descriptor?.code === 'ADMIN_COMPLIANCE_ACK_REQUIRED') {
    return new Sub2apiError(
      'SUB2API_ADMIN_COMPLIANCE_REQUIRED',
      'Sub2API administrator compliance acknowledgement is required before this operation can continue',
      { ...retryOptions, ...(descriptor.compliance === undefined ? {} : { compliance: descriptor.compliance }) },
    )
  }
  if (descriptor?.code === 'INSUFFICIENT_BALANCE') {
    return new Sub2apiError('SUB2API_INSUFFICIENT_BALANCE', 'Sub2API account balance is insufficient', retryOptions)
  }
  if (status === 401) {
    return new Sub2apiError(
      request.base === 'gateway' ? 'SUB2API_KEY_INVALID' : 'SUB2API_REAUTH_REQUIRED',
      request.base === 'gateway' ? 'Sub2API rejected the managed API Key' : 'Sub2API authentication expired',
      retryOptions,
    )
  }
  if (status === 402) return new Sub2apiError('SUB2API_INSUFFICIENT_BALANCE', 'Sub2API account balance is insufficient', retryOptions)
  if (status === 403) return new Sub2apiError('SUB2API_FORBIDDEN', 'Sub2API rejected this operation', retryOptions)
  if (status === 404 && request.base === 'gateway' && request.path.replace(/\/+$/, '').endsWith('/models')) {
    return new Sub2apiError('SUB2API_MODEL_UNAVAILABLE', 'Sub2API model list is unavailable', retryOptions)
  }
  if (status === 408) return new Sub2apiError('SUB2API_TIMEOUT', 'Sub2API request timed out', { ...retryOptions, retryable: true })
  if (status === 429) return new Sub2apiError('SUB2API_RATE_LIMITED', 'Sub2API rate limit reached', { ...retryOptions, retryable: true })
  if (status >= 500) return new Sub2apiError('SUB2API_SERVICE_UNAVAILABLE', 'Sub2API service is unavailable', { ...retryOptions, retryable: true })
  return new Sub2apiError('SUB2API_BAD_REQUEST', `Sub2API rejected the request with HTTP ${status}`, retryOptions)
}

function parseErrorDescriptor(body: string): Sub2apiErrorDescriptor | undefined {
  if (body.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined
  const code = stringField(parsed, 'code')
  if (code !== 'ADMIN_COMPLIANCE_ACK_REQUIRED') return code === undefined ? undefined : { code }
  const metadata = parsed.metadata
  if (!isRecord(metadata)) return { code }
  const version = stringField(metadata, 'version')
  const documentUrlZh = stringField(metadata, 'document_url_zh')
  const documentUrlEn = stringField(metadata, 'document_url_en')
  const ackPhraseZh = stringField(metadata, 'ack_phrase_zh')
  const ackPhraseEn = stringField(metadata, 'ack_phrase_en')
  const compliance: Sub2apiComplianceRequirement = {
    ...(version === undefined ? {} : { version }),
    ...(documentUrlZh === undefined ? {} : { documentUrlZh }),
    ...(documentUrlEn === undefined ? {} : { documentUrlEn }),
    ...(ackPhraseZh === undefined ? {} : { ackPhraseZh }),
    ...(ackPhraseEn === undefined ? {} : { ackPhraseEn }),
  }
  return Object.keys(compliance).length === 0 ? { code } : { code, compliance }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' || trimmed.length > 2_048 ? undefined : trimmed
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined
  const seconds = Number(value.trim())
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.min(Math.round(seconds * 1_000), MAX_NODE_TIMER_DELAY_MS)
}

interface Deadline {
  readonly signal: AbortSignal
  readonly timedOut: () => boolean
  readonly dispose: () => void
}

function createDeadline(parent: AbortSignal | undefined, timeoutMs: number): Deadline {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('Sub2API request timed out'))
  }, timeoutMs)
  const abort = (): void => { controller.abort(parent?.reason) }
  if (parent !== undefined) {
    if (parent.aborted) abort()
    else parent.addEventListener('abort', abort, { once: true })
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', abort)
    },
  }
}

function translateTransportError(error: unknown, parent: AbortSignal | undefined, deadline: Deadline): Sub2apiError {
  if (error instanceof Sub2apiError) return error
  if (deadline.timedOut()) return new Sub2apiError('SUB2API_TIMEOUT', 'Sub2API request timed out', { cause: error, retryable: true })
  if (parent?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    return new Sub2apiError('SUB2API_CANCELLED', 'Sub2API request was cancelled', { cause: error })
  }
  return new Sub2apiError('SUB2API_SERVICE_UNAVAILABLE', 'Sub2API request failed', { cause: error, retryable: true })
}
