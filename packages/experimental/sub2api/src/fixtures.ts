import type {
  CredentialKey,
  CredentialRecord,
} from '@deepseek-ai/dsh-credentials'
import { Sub2apiError } from './errors.ts'
import type { Sub2apiFetch, Sub2apiHttpMethod } from './http.ts'
import { sub2apiDeploymentFingerprint } from './profile.ts'
import type { Sub2apiDeploymentFingerprint } from './types.ts'

/** Request observed by a protocol fixture; fixture-only data never enters production logs. */
export interface Sub2apiFixtureRequest {
  readonly url: URL
  readonly method: string
  readonly headers: Headers
  readonly body: unknown
  readonly signal: AbortSignal | undefined
}

/** Handler for one deterministic protocol-fixture request. */
export type Sub2apiFixtureHandler = (request: Sub2apiFixtureRequest) => Response | Promise<Response>

/** One JSON-safe request assertion and response in a versioned business fixture. */
export interface Sub2apiFixtureExchange {
  readonly name: string
  readonly request: {
    readonly method: Sub2apiHttpMethod
    /** Absolute path and optional query expected after URL resolution. */
    readonly path: string
    /** Header names that must be present; values are intentionally not recorded. */
    readonly requiredHeaders?: readonly string[]
    /** JSON object keys required in the request body; values are never stored in the fixture. */
    readonly bodyKeys?: readonly string[]
  }
  readonly response: {
    readonly status: number
    readonly body: unknown
    readonly contentType?: string
    readonly headers?: Readonly<Record<string, string>>
  }
}

/** Version-one, target-bound business fixture used for deterministic protocol replay. */
export interface Sub2apiFixtureDocument {
  readonly schemaVersion: 1
  readonly fixtureId: string
  readonly profileVersion: string
  readonly deploymentFingerprint: Sub2apiDeploymentFingerprint
  readonly exchanges: readonly Sub2apiFixtureExchange[]
}

/** In-memory fetch transport that records requests and delegates replies to a fixture handler. */
export class Sub2apiFixtureTransport {
  /** Requests recorded by this fixture-only transport. */
  readonly requests: Sub2apiFixtureRequest[] = []
  /** Fetch-compatible function delegated to the fixture handler. */
  readonly fetch: Sub2apiFetch

  /**
   * Create a fixture transport.
   * @param handler - deterministic response function for each request.
   */
  constructor(handler: Sub2apiFixtureHandler) {
    this.fetch = async (input, init) => {
      const request: Sub2apiFixtureRequest = {
        url: requestUrl(input),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: decodeRequestBody(init?.body),
        signal: init?.signal === null ? undefined : init?.signal,
      }
      this.requests.push(request)
      return handler(request)
    }
  }
}

/**
 * Parse and freeze one versioned fixture document at the test-data boundary.
 * @param value - untrusted JSON fixture value.
 * @returns the validated, frozen fixture document.
 */
export function parseSub2apiFixture(value: unknown): Sub2apiFixtureDocument {
  const root = requireRecord(value, 'fixture')
  if (root.schemaVersion !== 1) throw fixtureError('fixture schemaVersion must be 1')
  const fixtureId = requireNonEmptyString(root.fixtureId, 'fixtureId')
  const profileVersion = requireNonEmptyString(root.profileVersion, 'profileVersion')
  const deploymentFingerprint = sub2apiDeploymentFingerprint(requireNonEmptyString(root.deploymentFingerprint, 'deploymentFingerprint'))
  if (!Array.isArray(root.exchanges) || root.exchanges.length === 0) throw fixtureError('fixture exchanges must be non-empty')
  const exchanges = root.exchanges.map((entry, index) => parseExchange(entry, index))
  return Object.freeze({
    schemaVersion: 1,
    fixtureId,
    profileVersion,
    deploymentFingerprint,
    exchanges: Object.freeze(exchanges),
  })
}

/** Deterministic transport that replays a parsed fixture in request order. */
export class Sub2apiFixtureReplay extends Sub2apiFixtureTransport {
  private readonly cursor: { value: number }

  /**
   * @param fixture - parsed, target-bound fixture document.
   */
  constructor(fixture: Sub2apiFixtureDocument) {
    const cursor = { value: 0 }
    super((request) => {
      const expected = fixture.exchanges[cursor.value]
      if (expected === undefined || !matchesExchange(expected, request)) {
        throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API fixture request did not match the expected exchange')
      }
      cursor.value += 1
      return fixtureResponse(expected.response)
    })
    this.fixture = fixture
    this.cursor = cursor
  }

  /** Parsed fixture being replayed. */
  readonly fixture: Sub2apiFixtureDocument

  /** Number of exchanges not consumed by replay. */
  get remainingExchangeCount(): number {
    return this.fixture.exchanges.length - this.cursor.value
  }

  /** Whether every fixture exchange has been consumed exactly once. */
  get completed(): boolean {
    return this.remainingExchangeCount === 0
  }
}

/**
 * Create a JSON response without depending on a target deployment's envelope.
 * @param body - JSON-safe response value.
 * @param status - HTTP status returned by the fixture.
 * @param headers - additional response headers.
 * @returns a fetch-compatible JSON response.
 */
export function sub2apiFixtureJson(body: unknown, status = 200, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** Small credential store for service fixtures; writes follow the production record API. */
export class MemorySub2apiCredentialStore {
  private readonly records = new Map<string, CredentialRecord>()
  /** Credential keys written by this fixture store. */
  readonly writes: CredentialKey[] = []
  /** Credential keys deleted by this fixture store. */
  readonly deletes: CredentialKey[] = []

  /**
   * Read one stored record.
   * @param key - credential record key.
   * @returns the stored record, when present.
   */
  readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    return Promise.resolve(this.records.get(key))
  }

  /**
   * Apply one serialized record mutation.
   * @param key - credential record key.
   * @param mutate - mutation applied to the current record.
   * @returns the stored record after the mutation.
   */
  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const next = await mutate(this.records.get(key))
    if (next !== undefined) {
      this.records.set(key, next)
      this.writes.push(key)
    }
    return next
  }

  /**
   * Remove one record.
   * @param key - credential record key.
   * @returns resolution after removal.
   */
  deleteRecord(key: CredentialKey): Promise<void> {
    this.records.delete(key)
    this.deletes.push(key)
    return Promise.resolve()
  }
}

function decodeRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string' || body.length === 0) return undefined
  try {
    return JSON.parse(body) as unknown
  } catch {
    return body
  }
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return new URL(input)
  if (typeof input === 'string') return new URL(input)
  return new URL(input.url)
}

function parseExchange(value: unknown, index: number): Sub2apiFixtureExchange {
  const root = requireRecord(value, `fixture exchange ${index + 1}`)
  const name = requireNonEmptyString(root.name, `fixture exchange ${index + 1} name`)
  const request = requireRecord(root.request, `${name} request`)
  const method = requireMethod(request.method, `${name} request method`)
  const path = normalizeFixturePath(request.path, `${name} request path`)
  const requiredHeaders = optionalStringArray(request.requiredHeaders, `${name} request requiredHeaders`)
  const bodyKeys = optionalStringArray(request.bodyKeys, `${name} request bodyKeys`)
  const response = requireRecord(root.response, `${name} response`)
  const status = response.status
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) {
    throw fixtureError(`${name} response status must be an integer from 100 through 599`)
  }
  const contentType = response.contentType === undefined ? undefined : requireNonEmptyString(response.contentType, `${name} response contentType`)
  const headers = optionalHeaders(response.headers, `${name} response headers`)
  if (headers !== undefined && Object.keys(headers).some(key => ['authorization', 'cookie', 'set-cookie', 'x-api-key'].includes(key.toLowerCase()))) {
    throw fixtureError(`${name} response headers must not contain credentials`)
  }
  const body = cloneFixtureBody(response.body, `${name} response body`)
  return Object.freeze({
    name,
    request: Object.freeze({
      method,
      path,
      ...(requiredHeaders === undefined ? {} : { requiredHeaders: Object.freeze(requiredHeaders) }),
      ...(bodyKeys === undefined ? {} : { bodyKeys: Object.freeze(bodyKeys) }),
    }),
    response: Object.freeze({
      status,
      body,
      ...(contentType === undefined ? {} : { contentType }),
      ...(headers === undefined ? {} : { headers: Object.freeze(headers) }),
    }),
  })
}

function matchesExchange(expected: Sub2apiFixtureExchange, request: Sub2apiFixtureRequest): boolean {
  if (expected.request.method !== request.method || expected.request.path !== `${request.url.pathname}${request.url.search}`) return false
  if (expected.request.requiredHeaders?.some(name => !request.headers.has(name))) return false
  if (expected.request.bodyKeys === undefined) return true
  if (!isRecord(request.body)) return false
  return expected.request.bodyKeys.every(key => Object.prototype.hasOwnProperty.call(request.body, key))
}

function fixtureResponse(response: Sub2apiFixtureExchange['response']): Response {
  const contentType = response.contentType ?? (typeof response.body === 'string' ? 'text/plain' : 'application/json')
  const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body)
  return new Response(body, {
    status: response.status,
    headers: { 'content-type': contentType, ...response.headers },
  })
}

function normalizeFixturePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value === '' || !value.startsWith('/') || value.startsWith('//') || value.includes('#')) {
    throw fixtureError(`${label} must be an absolute path without a fragment`)
  }
  const url = new URL(`https://fixture.invalid${value}`)
  return `${url.pathname}${url.search}`
}

function requireMethod(value: unknown, label: string): Sub2apiHttpMethod {
  if (value === 'DELETE' || value === 'GET' || value === 'PATCH' || value === 'POST') return value
  throw fixtureError(`${label} is not a supported HTTP method`)
}

function optionalStringArray(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  const entries: unknown[] = Array.isArray(value) ? value : []
  if (entries.length === 0 || !entries.every((entry): entry is string => typeof entry === 'string' && entry !== '')) {
    throw fixtureError(`${label} must be a non-empty string array`)
  }
  return [...new Set(entries)]
}

function optionalHeaders(value: unknown, label: string): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  const headers = requireRecord(value, label)
  const result: Record<string, string> = {}
  for (const [name, headerValue] of Object.entries(headers)) {
    if (typeof headerValue !== 'string') throw fixtureError(`${label} values must be strings`)
    result[name] = headerValue
  }
  return result
}

function cloneFixtureBody(value: unknown, label: string): unknown {
  try {
    const serialized: unknown = JSON.stringify(value)
    if (typeof serialized !== 'string') throw fixtureError(`${label} must be JSON-serializable`)
    return JSON.parse(serialized) as unknown
  } catch (error: unknown) {
    if (error instanceof Sub2apiError) throw error
    throw fixtureError(`${label} must be JSON-serializable`, error)
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw fixtureError(`${label} must be an object`)
  return value
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw fixtureError(`${label} must be a non-empty string`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fixtureError(message: string, cause?: unknown): Sub2apiError {
  return new Sub2apiError('SUB2API_BAD_REQUEST', `Sub2API fixture: ${message}`, { cause })
}
