import { describe, expect, it } from 'vitest'
import accountFixture from './fixtures/account-v1.json'
import gatewayFixture from './fixtures/gateway-v1.json'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import {
  applySub2apiStateEvent,
  createStandardSub2apiCodec,
  createSub2apiSnapshot,
  normalizeSub2apiOrigin,
  parseSub2apiGrantRecord,
  redactSub2apiGrantRecord,
  resolveSub2apiProfile,
  Sub2apiError,
  Sub2apiFixtureReplay,
  Sub2apiFixtureTransport,
  Sub2apiGenerationGuard,
  Sub2apiHttpClient,
  Sub2apiRuntimeService,
  type Sub2apiModelSettingsStore,
  Sub2apiLlmProvider,
  SUB2API_RECORD_KEY,
  isSub2apiRecord,
  parseSub2apiPayload,
  sub2apiFixtureJson,
  sub2apiDeploymentFingerprint,
  sub2apiSecret,
  sub2apiUrl,
  MemorySub2apiCredentialStore,
  parseSub2apiFixture,
  parseSub2apiCompatibilityMatrix,
  parseSub2apiTargetEvidence,
  SUB2API_LOCKED_BASELINE,
} from '../src/index.ts'
import compatibilityMatrix from './fixtures/compatibility-matrix-v1.json'
import targetEvidence from './fixtures/target-local-0.2.5-v1.json'

const paths = {
  accountPaths: {
    login: '/auth/login',
    register: '/auth/register',
    loginTwoFactor: '/auth/login/2fa',
    refresh: '/auth/refresh',
    me: '/auth/me',
    apiKeys: '/keys',
    groupsAvailable: '/groups/available',
    usage: '/usage/dashboard/stats',
    recharge: '/billing/recharge',
    publicSettings: '/settings/public',
  },
  gatewayPaths: { models: '/v1/models', chatCompletions: '/v1/chat/completions' },
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.toString()
  if (typeof input === 'string') return input
  return input.url
}

function withoutRechargePath(accountPaths: typeof paths.accountPaths): Omit<typeof paths.accountPaths, 'recharge'> {
  const { recharge: _recharge, ...rest } = accountPaths
  return rest
}

describe('Sub2API profile', () => {
  it('normalizes explicit account and gateway compatibility choices', () => {
    const profile = resolveSub2apiProfile({
      version: '0.2.5',
      accountBaseUrl: 'https://account.example.test/api/v1/',
      gatewayBaseUrl: 'https://gateway.example.test/',
      ...paths,
      accountResponseEnvelope: 'both',
      gatewayResponseEnvelope: 'direct',
      gatewayAuthScheme: 'api-key',
    })
    expect(profile.accountBaseUrl).toBe('https://account.example.test/api/v1')
    expect(profile.gatewayBaseUrl).toBe('https://gateway.example.test')
    expect(profile.account.paths.loginTwoFactor).toBe('/auth/login/2fa')
    expect(sub2apiUrl(profile.accountBaseUrl, profile.account.paths.login)).toBe('https://account.example.test/api/v1/auth/login')
    expect(Object.isFrozen(profile)).toBe(true)
  })

  it('allows only exact development HTTP origins and rejects unsafe hosts', () => {
    expect(normalizeSub2apiOrigin('http://dev.example.test', ['http://dev.example.test'])).toBe('http://dev.example.test')
    expect(normalizeSub2apiOrigin('http://127.0.0.1:8090', ['http://127.0.0.1:8090'])).toBe('http://127.0.0.1:8090')
    expect(() => normalizeSub2apiOrigin('http://dev.example.test')).toThrow(/HTTPS|exact development origin/)
    for (const value of ['https://localhost', 'https://127.0.0.1', 'https://192.168.1.10', 'https://[::1]', 'https://[::ffff:127.0.0.1]']) {
      expect(() => normalizeSub2apiOrigin(value)).toThrow(/host is not allowed/)
    }
    expect(() => resolveSub2apiProfile({ version: '', accountBaseUrl: 'https://account.example.test', gatewayBaseUrl: 'https://gateway.example.test', ...paths })).toThrow(/version is required/)
    expect(() => sub2apiUrl('https://gateway.example.test', 'https://evil.example.test')).toThrow(Sub2apiError)
    expect(() => resolveSub2apiProfile({ version: '1', accountBaseUrl: 'https://account.example.test', gatewayBaseUrl: 'https://gateway.example.test', ...paths, accountPaths: { ...paths.accountPaths, login: 'auth/login' } })).toThrow(/endpoint paths/)
  })
})

describe('Sub2API durable grant records', () => {
  const raw = {
    version: 1,
    deployment: { origin: 'https://account.example.test', fingerprint: 'deployment-1' },
    account: { userId: 'user-1', email: 'user@example.test', displayName: 'User' },
    auth: { refreshToken: 'refresh-secret', refreshTokenType: 'Bearer', lastRefreshAt: 100 },
    apiKey: { id: 'key-1', name: 'dsh-managed', secret: 'api-secret', fingerprint: 'key-fp', createdAt: 90 },
    generation: 2,
    updatedAt: 110,
  }

  it('parses and redacts secrets while preserving safe metadata', () => {
    const record = parseSub2apiGrantRecord(raw)
    expect(record.auth.refreshToken).toBe('refresh-secret')
    expect(record.apiKey.secret).toBe('api-secret')
    expect(redactSub2apiGrantRecord(record)).toEqual({
      version: 1,
      deployment: { origin: 'https://account.example.test', fingerprint: 'deployment-1' },
      account: { userId: 'user-1', email: 'user@example.test', displayName: 'User' },
      auth: { hasRefreshToken: true },
      apiKey: { id: 'key-1', name: 'dsh-managed', fingerprint: 'key-fp', createdAt: 90, configured: true },
      generation: 2,
      updatedAt: 110,
    })
    expect(JSON.stringify(redactSub2apiGrantRecord(record))).not.toContain('secret')
    expect(sub2apiSecret('x')).toBe('x')
  })

  it('rejects malformed durable values without echoing credentials', () => {
    for (const invalid of [null, {}, { ...raw, version: 2 }, { ...raw, apiKey: { ...raw.apiKey, secret: '' } }, { ...raw, generation: -1 }, { ...raw, deployment: { ...raw.deployment, origin: 'http://localhost' } }]) {
      expect(() => parseSub2apiGrantRecord(invalid)).toThrow(Sub2apiError)
    }
    expect(() => sub2apiSecret('')).toThrow(/must not be empty/)
  })

  it('accepts an exact development origin when the active profile allows it', () => {
    const record = parseSub2apiGrantRecord({
      ...raw,
      deployment: { ...raw.deployment, origin: 'http://127.0.0.1:8090' },
    }, ['http://127.0.0.1:8090'])
    expect(record.deployment.origin).toBe('http://127.0.0.1:8090')
  })
})

describe('Sub2API standard codec', () => {
  it('encodes the locked registration and TOTP field names', () => {
    const codec = createStandardSub2apiCodec()
    expect(codec.encodeRegister({
      email: 'user@example.test',
      password: 'password-not-persisted',
      verificationCode: 'verify-1',
    })).toEqual({
      email: 'user@example.test',
      password: 'password-not-persisted',
      verify_code: 'verify-1',
    })
    expect(codec.encodeTwoFactor({ code: '123456' }, 'temp-1')).toEqual({
      totp_code: '123456',
      temp_token: 'temp-1',
    })
  })

  it('normalizes numeric and ISO API Key creation timestamps', () => {
    const codec = createStandardSub2apiCodec()
    const createdAt = Date.parse('2026-09-17T00:00:00.000Z')
    expect(codec.decodeCreatedApiKey({ name: 'managed', key: 'secret', active: true, created_at: '2026-09-17T00:00:00.000Z' })).toMatchObject({ createdAt })
    expect(codec.decodeApiKeys({ data: [{ name: 'managed', active: true, created_at: 42 }] })).toMatchObject([{ createdAt: 42 }])
    expect(() => codec.decodeCreatedApiKey({ name: 'managed', key: 'secret', active: true, created_at: 'not-a-date' })).toThrow(/created_at/u)
  })

  it('decodes public capability settings and treats empty recharge URLs as absent', () => {
    const codec = createStandardSub2apiCodec()
    expect(codec.decodePublicSettings({
      registration_enabled: false,
      email_verify_enabled: true,
      totp_enabled: false,
      payment_enabled: false,
      subscription_enabled: true,
      payment_balance_disabled: true,
      purchase_subscription_url: '',
      balance_low_notify_recharge_url: 'https://billing.example.test/recharge',
    })).toEqual({
      registrationEnabled: false,
      emailVerifyEnabled: true,
      totpEnabled: false,
      paymentEnabled: false,
      subscriptionEnabled: true,
      paymentBalanceDisabled: true,
      rechargeUrl: 'https://billing.example.test/recharge',
    })
    expect(() => codec.decodePublicSettings({ registration_enabled: 'false' })).toThrow(Sub2apiError)
  })
})

describe('Sub2API state and generation', () => {
  const account = { userId: 'user-1', email: 'user@example.test' }

  it('enforces lifecycle transitions and publishes stable error states', () => {
    let snapshot = createSub2apiSnapshot(1)
    snapshot = applySub2apiStateEvent(snapshot, { type: 'begin-authentication', at: 2 })
    snapshot = applySub2apiStateEvent(snapshot, { type: 'two-factor-required', at: 3 })
    expect(snapshot.status).toBe('two-factor-required')
    snapshot = applySub2apiStateEvent(snapshot, { type: 'authenticated', account, at: 4 })
    expect(snapshot).toMatchObject({ status: 'authenticated', generation: 1, account })
    snapshot = applySub2apiStateEvent(snapshot, { type: 'begin-refresh', at: 5 })
    snapshot = applySub2apiStateEvent(snapshot, { type: 'insufficient-balance', at: 6 })
    expect(snapshot.error?.code).toBe('SUB2API_INSUFFICIENT_BALANCE')
    snapshot = applySub2apiStateEvent(snapshot, { type: 'authenticated', account, at: 7 })
    snapshot = applySub2apiStateEvent(snapshot, { type: 'begin-sign-out', at: 8 })
    snapshot = applySub2apiStateEvent(snapshot, { type: 'signed-out', at: 9 })
    expect(snapshot).toEqual({ status: 'signed-out', generation: 2, updatedAt: 9 })
    expect(() => applySub2apiStateEvent(snapshot, { type: 'begin-refresh', at: 10 })).toThrow(/not valid/)
    expect(() => createSub2apiSnapshot(-1)).toThrow(/timestamp/)
  })

  it('discards stale async results by generation', () => {
    const guard = new Sub2apiGenerationGuard()
    const captured = guard.capture()
    expect(guard.isCurrent(captured)).toBe(true)
    expect(guard.advance()).toBe(1)
    expect(guard.current).toBe(1)
    expect(guard.isCurrent(captured)).toBe(false)
    expect(guard.isCurrent(guard.capture())).toBe(true)
  })
})

describe('Sub2API HTTP client', () => {
  const profile = resolveSub2apiProfile({
    version: '0.2.5',
    accountBaseUrl: 'https://account.example.test/api/v1',
    gatewayBaseUrl: 'https://gateway.example.test',
    ...paths,
    gatewayAuthScheme: 'api-key',
  })

  it('builds protocol headers, validates the destination, and caps the returned body', async () => {
    const destinations: string[] = []
    let received: { url: string; init: RequestInit } | undefined
    const client = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 128,
      timeoutMs: 1_000,
      maxRedirects: 2,
      validateDestination: async (url) => { destinations.push(url.toString()) },
      fetch: async (input, init) => {
        received = { url: requestUrl(input), init: init ?? {} }
        return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
      },
    })

    const response = await client.request({
      base: 'account',
      path: paths.accountPaths.login,
      method: 'POST',
      body: { email: 'user@example.test', password: 'not-persisted' },
    })

    expect(response.body).toBe('{"ok":true}')
    expect(destinations).toEqual(['https://account.example.test/api/v1/auth/login'])
    expect(received?.url).toBe(destinations[0])
    expect(received?.init).toMatchObject({ method: 'POST', redirect: 'manual' })
    expect(received?.init.headers).toMatchObject({ accept: 'application/json', 'content-type': 'application/json' })
    const body = received?.init.body
    expect(typeof body === 'string' ? body : '').toContain('user@example.test')
  })

  it('uses the configured API Key header and maps retryable status details', async () => {
    let requestHeaders: HeadersInit | undefined
    const client = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 128,
      timeoutMs: 1_000,
      maxRedirects: 0,
      validateDestination: async () => {},
      fetch: async (_input, init) => {
        requestHeaders = init?.headers
        return new Response('', { status: 429, headers: { 'retry-after': '3' } })
      },
    })

    await expect(client.request({
      base: 'gateway',
      path: paths.gatewayPaths.models,
      method: 'GET',
      credential: { kind: 'api-key', value: 'secret-not-returned' },
    })).rejects.toMatchObject({ code: 'SUB2API_RATE_LIMITED', retryAfterMs: 3_000, retryable: true })
    expect(new Headers(requestHeaders).get('x-api-key')).toBe('secret-not-returned')
  })

  it('maps the gateway balance business code when the deployment uses HTTP 403', async () => {
    const client = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 1_024,
      timeoutMs: 1_000,
      maxRedirects: 0,
      validateDestination: async () => {},
      fetch: async () => new Response(JSON.stringify({
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient account balance',
      }), { status: 403, headers: { 'content-type': 'application/json' } }),
    })

    await expect(client.request({
      base: 'gateway',
      path: paths.gatewayPaths.models,
      method: 'GET',
      credential: { kind: 'api-key', value: 'secret-not-returned' },
    })).rejects.toMatchObject({ code: 'SUB2API_INSUFFICIENT_BALANCE', httpStatus: 403 })
  })

  it('preserves only safe compliance metadata from the administrator gate', async () => {
    const client = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 1_024,
      timeoutMs: 1_000,
      maxRedirects: 0,
      validateDestination: async () => {},
      fetch: async () => new Response(JSON.stringify({
        code: 'ADMIN_COMPLIANCE_ACK_REQUIRED',
        message: 'do not expose this upstream message',
        metadata: {
          version: 'v2026.06.10',
          document_url_zh: 'https://docs.example.test/admin.zh.md',
          document_url_en: 'https://docs.example.test/admin.en.md',
          ack_phrase_zh: '我已阅读、理解并同意',
          ack_phrase_en: 'I have read and agree',
          credential: 'must not cross the transport boundary',
        },
      }), { status: 423, headers: { 'content-type': 'application/json' } }),
    })

    await expect(client.request({ base: 'account', path: paths.accountPaths.me, method: 'GET' })).rejects.toMatchObject({
      code: 'SUB2API_ADMIN_COMPLIANCE_REQUIRED',
      httpStatus: 423,
      compliance: {
        version: 'v2026.06.10',
        documentUrlZh: 'https://docs.example.test/admin.zh.md',
        documentUrlEn: 'https://docs.example.test/admin.en.md',
        ackPhraseZh: '我已阅读、理解并同意',
        ackPhraseEn: 'I have read and agree',
      },
    })
    try {
      await client.request({ base: 'account', path: paths.accountPaths.me, method: 'GET' })
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Sub2apiError)
      if (error instanceof Sub2apiError) {
        expect(error.message).not.toContain('do not expose this upstream message')
        expect(JSON.stringify(error.toSummary())).not.toContain('credential')
      }
    }
  })

  it('revalidates same-origin redirects and refuses cross-origin redirects before contact', async () => {
    const destinations: string[] = []
    const contacted: string[] = []
    const client = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 128,
      timeoutMs: 1_000,
      maxRedirects: 2,
      validateDestination: async (url) => { destinations.push(url.toString()) },
      fetch: async (input) => {
        const url = requestUrl(input)
        contacted.push(url)
        if (url.endsWith('/auth/me')) return new Response('', { status: 307, headers: { location: '?step=2' } })
        return new Response('ok', { status: 200 })
      },
    })
    await expect(client.request({ base: 'account', path: paths.accountPaths.me, method: 'GET' })).resolves.toMatchObject({ body: 'ok' })
    expect(destinations).toEqual([
      'https://account.example.test/api/v1/auth/me',
      'https://account.example.test/api/v1/auth/me?step=2',
    ])

    const refusingClient = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 128,
      timeoutMs: 1_000,
      maxRedirects: 2,
      validateDestination: async () => {},
      fetch: async () => new Response('', { status: 302, headers: { location: 'https://evil.example.test/collect' } }),
    })
    await expect(refusingClient.request({ base: 'account', path: paths.accountPaths.me, method: 'GET' })).rejects.toMatchObject({ code: 'SUB2API_PROTOCOL_MISMATCH' })
    expect(contacted).toHaveLength(2)
  })

  it('maps cancellation and response-size failures without returning upstream bodies', async () => {
    const controller = new AbortController()
    const client = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 4,
      timeoutMs: 1_000,
      maxRedirects: 0,
      validateDestination: async () => {},
      fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          const reason: unknown = init.signal.reason
          reject(reason instanceof Error ? reason : new Error('request aborted'))
          return
        }
        init?.signal?.addEventListener('abort', () => {
          const reason: unknown = init.signal?.reason
          reject(reason instanceof Error ? reason : new Error('request aborted'))
        }, { once: true })
      }),
    })
    const pending = client.request({ base: 'account', path: paths.accountPaths.me, method: 'GET' }, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'SUB2API_CANCELLED' })

    const oversized = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 4,
      timeoutMs: 1_000,
      maxRedirects: 0,
      validateDestination: async () => {},
      fetch: async () => new Response('secret-body', { status: 200, headers: { 'content-length': '11' } }),
    })
    await expect(oversized.request({ base: 'account', path: paths.accountPaths.me, method: 'GET' })).rejects.toMatchObject({ code: 'SUB2API_BAD_RESPONSE' })
  })

  it('rejects caller-supplied credential headers and wrong-plane credentials before transport', async () => {
    const client = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 128,
      timeoutMs: 1_000,
      maxRedirects: 0,
      validateDestination: async () => { throw new Error('must not resolve') },
      fetch: async () => new Response('unexpected'),
    })
    await expect(client.request({ base: 'account', path: paths.accountPaths.me, method: 'GET', headers: { Authorization: 'spoof' } })).rejects.toMatchObject({ code: 'SUB2API_BAD_REQUEST' })
    await expect(client.request({ base: 'gateway', path: paths.gatewayPaths.models, method: 'GET', credential: { kind: 'access-token', value: 'token' } })).rejects.toMatchObject({ code: 'SUB2API_BAD_REQUEST' })
  })

  it('exposes a provider fetch that validates the target and refuses implicit redirects', async () => {
    const destinations: string[] = []
    let receivedInit: RequestInit | undefined
    const client = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 128,
      timeoutMs: 1_000,
      maxRedirects: 0,
      validateDestination: async (url) => { destinations.push(url.toString()) },
      fetch: async (_input, init) => {
        receivedInit = init
        return new Response('', { status: 302, headers: { location: 'https://evil.example.test' } })
      },
    })
    const response = await client.createValidatedFetch()('https://gateway.example.test/v1/chat/completions', { method: 'POST' })
    expect(response.status).toBe(302)
    expect(destinations).toEqual(['https://gateway.example.test/v1/chat/completions'])
    expect(receivedInit).toMatchObject({ method: 'POST', redirect: 'manual' })
  })
})

describe('Sub2API response envelopes', () => {
  it('accepts direct JSON and unwraps a configured data envelope', () => {
    expect(parseSub2apiPayload('{"userId":"user-1"}', 'direct')).toEqual({ userId: 'user-1' })
    expect(parseSub2apiPayload('{"code":0,"message":"ok","data":{"userId":"user-1"}}', 'data')).toEqual({ userId: 'user-1' })
    expect(parseSub2apiPayload('{"data":[{"id":"model-1"}]}', 'both')).toEqual([{ id: 'model-1' }])
    expect(isSub2apiRecord({ data: [] })).toBe(true)
    expect(isSub2apiRecord([])).toBe(false)
  })

  it('rejects invalid JSON and a missing data envelope without exposing the body', () => {
    for (const [body, envelope] of [['not-json', 'direct'], ['{"userId":"user-1"}', 'data']] as const) {
      expect(() => parseSub2apiPayload(body, envelope)).toThrow(Sub2apiError)
      try {
        parseSub2apiPayload(body, envelope)
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Sub2apiError)
        if (error instanceof Sub2apiError) expect(error.code).toMatch(/^SUB2API_/)
        expect(String(error)).not.toContain(body)
      }
    }
  })
})

describe('Sub2API standard deployment response fields', () => {
  it('maps the 0.2.x account, numeric identifiers, paginated keys, and dashboard cost fields', () => {
    const codec = createStandardSub2apiCodec()
    expect(codec.encodeRegister({ email: 'user@example.test', password: 'password', verificationCode: 'verify-1' })).toEqual({
      email: 'user@example.test',
      password: 'password',
      verify_code: 'verify-1',
    })
    expect(codec.encodeTwoFactor({ code: '123456' }, 'temp-token')).toEqual({
      totp_code: '123456',
      temp_token: 'temp-token',
    })
    expect(codec.decodeAccount({ id: 42, username: 'user-name', email: 'user@example.test', balance: 12.5 })).toEqual({
      userId: '42',
      displayName: 'user-name',
      email: 'user@example.test',
      balance: 12.5,
    })
    expect(codec.decodeAccount({ id: 42, username: '', email: 'user@example.test', balance: 12.5 })).toEqual({
      userId: '42',
      email: 'user@example.test',
      balance: 12.5,
    })
    expect(codec.decodeApiKeys({ items: [{ id: 7, name: 'dsh:managed', status: 'active' }] })).toEqual([{
      id: '7',
      name: 'dsh:managed',
      active: true,
    }])
    expect(codec.decodeUsage({ total_actual_cost: 1.75, total_requests: 3 }, 2_000)).toEqual({
      used: 1.75,
      asOf: 2_000,
      stale: false,
    })
  })
})

describe('Sub2API model metadata', () => {
  it('preserves explicit endpoint, capability, capacity, and source facts', () => {
    const codec = createStandardSub2apiCodec()
    expect(codec.decodeModels({ models: [{
      id: 'gateway-model',
      name: 'Gateway Model',
      endpoint_family: 'chat-completions',
      supports_streaming: true,
      supports_tools: 'verified',
      supports_vision: false,
      supports_reasoning: 'unknown',
      supports_responses: 'unsupported',
      context_window: 131072,
      max_output_tokens: 8192,
      source: 'fixture',
    }] })).toEqual([{
      id: 'gateway-model',
      displayName: 'Gateway Model',
      endpointFamily: 'chat-completions',
      supportsStreaming: 'verified',
      supportsTools: 'verified',
      supportsVision: 'unsupported',
      supportsReasoning: 'unknown',
      supportsResponses: 'unsupported',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      source: 'fixture',
    }])
  })

  it('rejects malformed capability metadata instead of inferring support', () => {
    const codec = createStandardSub2apiCodec()
    expect(() => codec.decodeModels({ models: [{ id: 'gateway-model', supports_tools: 'maybe' }] })).toThrow(Sub2apiError)
    expect(() => codec.decodeModels({ models: [{ id: 'gateway-model', endpoint_family: 'chat' }] })).toThrow(Sub2apiError)
  })
})

describe('Sub2API versioned business fixtures', () => {
  it('parses and replays the synthetic account fixture without recording header values', async () => {
    const fixture = parseSub2apiFixture(accountFixture)
    const replay = new Sub2apiFixtureReplay(fixture)
    const response = await replay.fetch('https://account.example.test/api/v1/auth/login', {
      method: 'POST',
      headers: { authorization: 'fixture-user-token' },
      body: JSON.stringify({ email: 'fixture@example.test', password: 'not-part-of-fixture' }),
    })

    await expect(response.json()).resolves.toEqual({
      data: {
        access_token: 'fixture-access-token',
        refresh_token: 'fixture-refresh-token',
        expires_in: 3600,
      },
    })
    expect(replay.fixture.fixtureId).toBe('synthetic-account-v1')
    expect(replay.requests[0]?.headers.get('authorization')).toBe('fixture-user-token')
    expect(replay.remainingExchangeCount).toBe(5)
  })

  it('fails closed for malformed fixture documents and out-of-order requests', async () => {
    expect(() => parseSub2apiFixture({
      schemaVersion: 2,
      fixtureId: 'future',
      profileVersion: 'fixture-1',
      deploymentFingerprint: 'fixture-1',
      exchanges: [],
    })).toThrow(Sub2apiError)

    const replay = new Sub2apiFixtureReplay(parseSub2apiFixture(accountFixture))
    await expect(replay.fetch('https://account.example.test/api/v1/auth/me', { method: 'GET' })).rejects.toMatchObject({
      code: 'SUB2API_PROTOCOL_MISMATCH',
    })
    expect(replay.remainingExchangeCount).toBe(6)
  })
})

describe('Sub2API compatibility evidence', () => {
  it('keeps the locked baseline, target evidence, and synthetic fixture status separate', () => {
    const matrix = parseSub2apiCompatibilityMatrix(compatibilityMatrix)
    const target = parseSub2apiTargetEvidence(targetEvidence)
    expect(matrix.lockedBaseline).toBe(SUB2API_LOCKED_BASELINE)
    expect(matrix.targetDeployment).toBe(target.targetDeployment)
    expect(matrix.rows.filter(row => row.priority === 'P0')).toHaveLength(19)
    const observedCapabilities = new Set(target.observations.map(observation => observation.capability))
    expect(matrix.rows.filter(row => row.targetStatus === 'verified').map(row => row.capability).sort()).toEqual([...observedCapabilities].sort())
    expect(matrix.rows.filter(row => row.targetStatus === 'verified')).toHaveLength(12)
    expect(matrix.rows.filter(row => row.baselineStatus === 'verified')).toHaveLength(12)
    expect(matrix.rows.filter(row => row.priority === 'P0').every(row => row.targetEvidenceRequired)).toBe(true)
    expect(matrix.rows.find(row => row.capability === 'api-key-delete')?.targetEvidenceRequired).toBe(false)
    expect(matrix.rows.filter(row => row.fixtureStatus === 'synthetic').length).toBeGreaterThan(0)
    expect(target.observations.find(observation => observation.capability === 'chat-completions-sse')?.response).toMatchObject({
      contentType: 'text/event-stream',
      streamTerminated: true,
    })
  })

  it('rejects a matrix that substitutes another revision for the locked baseline', () => {
    expect(() => parseSub2apiCompatibilityMatrix({ ...compatibilityMatrix, lockedBaseline: 'other' })).toThrow(Sub2apiError)
  })

  it('rejects target evidence that repeats a capability or hides malformed response fields', () => {
    expect(() => parseSub2apiTargetEvidence({
      ...targetEvidence,
      observations: [targetEvidence.observations[0], targetEvidence.observations[0]],
    })).toThrow(/repeats capability/u)
    expect(() => parseSub2apiTargetEvidence({
      ...targetEvidence,
      observations: [{ ...targetEvidence.observations[0], response: { topLevelFields: ['code', 7] } }],
    })).toThrow(/string list/u)
  })
})

describe('Sub2API Host runtime and protocol fixtures', () => {
  const runtimeProfile = resolveSub2apiProfile({
    version: 'fixture-1',
    accountBaseUrl: 'https://account.example.test/api/v1',
    gatewayBaseUrl: 'https://gateway.example.test',
    ...paths,
    accountResponseEnvelope: 'both',
    gatewayResponseEnvelope: 'direct',
    gatewayAuthScheme: 'api-key',
  })

  function runtimeFor(
    transport: Sub2apiFixtureTransport,
    store = new MemorySub2apiCredentialStore(),
    now: () => number = () => 1_000,
    profile = runtimeProfile,
    modelSettings?: Sub2apiModelSettingsStore,
  ): Sub2apiRuntimeService {
    const http = new Sub2apiHttpClient({
      profile,
      maxResponseBytes: 16_384,
      timeoutMs: 1_000,
      maxRedirects: 2,
      validateDestination: async () => {},
      fetch: transport.fetch,
    })
    return new Sub2apiRuntimeService({
      profile,
      deploymentFingerprint: sub2apiDeploymentFingerprint(profile.version),
      http,
      credentials: store,
      managedKeyName: 'harness:fixture',
      managedKeyGroupId: 1,
      cacheTtlMs: { account: 100, models: 100, groups: 100, usage: 100, publicSettings: 100 },
      refreshSkewMs: 0,
      persistRefreshToken: true,
      rechargeAllowedOrigins: ['https://account.example.test'],
      now,
      ...(modelSettings === undefined ? {} : { modelSettings }),
    })
  }

  it('replays a versioned account fixture through login, managed-key setup, models, and usage', async () => {
    const replay = new Sub2apiFixtureReplay(parseSub2apiFixture(accountFixture))
    const runtime = runtimeFor(replay)

    await runtime.login({ email: 'fixture@example.test', password: 'not-part-of-fixture' })
    expect(runtime.state().apiKey).toMatchObject({ name: 'harness:fixture', active: true, groupId: 1 })
    expect(JSON.stringify(runtime.state())).not.toContain('fixture-api-key')
    await expect(runtime.refreshModels()).resolves.toMatchObject([{ id: 'fixture-model', displayName: 'Fixture Model' }])
    await expect(runtime.getUsage()).resolves.toMatchObject({ balance: 12.5, currency: 'USD', used: 1.25, limit: 20, stale: false })
    expect(replay.completed).toBe(true)
  })

  it('applies and persists a configured model context window', async () => {
    const replay = new Sub2apiFixtureReplay(parseSub2apiFixture(accountFixture))
    const overrides: Record<string, { readonly contextWindow?: number }> = {}
    const modelSettings: Sub2apiModelSettingsStore = {
      get: () => overrides,
      update: async (modelId, override) => { overrides[modelId] = override },
    }
    const runtime = runtimeFor(replay, new MemorySub2apiCredentialStore(), () => 1_000, runtimeProfile, modelSettings)

    await runtime.login({ email: 'fixture@example.test', password: 'not-part-of-fixture' })
    await runtime.refreshModels()
    await runtime.updateModelSettings({ modelId: 'fixture-model', contextWindow: 131_072 })

    expect(overrides).toEqual({ 'fixture-model': { contextWindow: 131_072 } })
    expect(runtime.state().models).toMatchObject([{ id: 'fixture-model', contextWindow: 131_072, source: 'configured' }])
  })

  it('reads public settings without credentials and reuses the explicit cache', async () => {
    let publicSettingsCalls = 0
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/settings/public')) {
        publicSettingsCalls += 1
        expect(request.headers.has('authorization')).toBe(false)
        return sub2apiFixtureJson({ data: {
          registration_enabled: false,
          payment_enabled: false,
          payment_balance_disabled: false,
          purchase_subscription_url: '',
        } })
      }
      throw new Error(`unexpected public-settings request: ${request.method} ${request.url.pathname}`)
    })
    const profile = resolveSub2apiProfile({
      version: 'public-settings-fixture',
      accountBaseUrl: 'https://account.example.test/api/v1',
      gatewayBaseUrl: 'https://gateway.example.test',
      ...paths,
      accountPaths: withoutRechargePath(paths.accountPaths),
    })
    const runtime = runtimeFor(transport, new MemorySub2apiCredentialStore(), () => 1_000, profile)

    await expect(runtime.getPublicSettings()).resolves.toEqual({
      registrationEnabled: false,
      paymentEnabled: false,
      paymentBalanceDisabled: false,
    })
    await expect(runtime.getPublicSettings()).resolves.toEqual({
      registrationEnabled: false,
      paymentEnabled: false,
      paymentBalanceDisabled: false,
    })
    await expect(runtime.getRechargeUrl()).resolves.toBeUndefined()
    expect(publicSettingsCalls).toBe(1)
  })

  it('replays gateway non-stream and SSE responses with usage and verified model metadata', async () => {
    const replay = new Sub2apiFixtureReplay(parseSub2apiFixture(gatewayFixture))
    const runtime = runtimeFor(replay)
    await runtime.login({ email: 'gateway@example.test', password: 'fixture-password' })
    await expect(runtime.refreshModels()).resolves.toMatchObject([{
      id: 'fixture-chat-model',
      endpointFamily: 'chat-completions',
      supportsStreaming: 'verified',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      source: 'fixture',
    }])
    const credential = await runtime.resolveGatewayCredential()
    const http = new Sub2apiHttpClient({
      profile: runtimeProfile,
      maxResponseBytes: 16_384,
      timeoutMs: 1_000,
      maxRedirects: 2,
      validateDestination: async () => {},
      fetch: replay.fetch,
    })
    const common = { model: 'fixture-chat-model', messages: [], stream: false }
    const normal = await http.request({
      base: 'gateway', path: paths.gatewayPaths.chatCompletions, method: 'POST',
      body: common, credential: { kind: 'api-key', value: credential.apiKey },
    })
    expect(parseSub2apiPayload(normal.body, 'direct')).toMatchObject({
      object: 'chat.completion',
      choices: [{ message: { content: 'fixture response' } }],
      usage: { total_tokens: 6 },
    })
    const streamed = await http.request({
      base: 'gateway', path: paths.gatewayPaths.chatCompletions, method: 'POST',
      body: { ...common, stream: true }, credential: { kind: 'api-key', value: credential.apiKey },
    })
    expect(streamed.contentType).toBe('text/event-stream')
    expect(streamed.body).toContain('data: [DONE]')
    const usage = await runtime.getUsage()
    expect(usage).toMatchObject({ balance: 8.75, used: 3.5, limit: 20, stale: false })
    expect(replay.completed).toBe(true)
  })

  it('registers the reserved LLM route only after verified dynamic models are available', async () => {
    const replay = new Sub2apiFixtureReplay(parseSub2apiFixture(gatewayFixture))
    const runtime = runtimeFor(replay)
    await runtime.login({ email: 'gateway@example.test', password: 'fixture-password' })
    await runtime.refreshModels()
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    ctx.provide('sub2api', runtime)
    const tool = { name: 'fixture_probe', description: 'Return a deterministic probe value.', parameters: { type: 'object', properties: {} } }
    new Sub2apiLlmProvider(ctx, { enabled: true, toolsEnabled: true, verifiedToolsModels: ['fixture-chat-model'] })
    await expect(ctx.llm.listModels('sub2api')).resolves.toMatchObject([{ id: 'fixture-chat-model' }])
    await expect(ctx.llm.resolveModelInfo('sub2api', 'fixture-chat-model')).resolves.toMatchObject({
      id: 'fixture-chat-model', context: { contextWindow: 131072 },
    })
    const credential = await runtime.resolveGatewayCredential()
    const http = new Sub2apiHttpClient({
      profile: runtimeProfile,
      maxResponseBytes: 16_384,
      timeoutMs: 1_000,
      maxRedirects: 2,
      validateDestination: async () => {},
      fetch: replay.fetch,
    })
    await http.request({
      base: 'gateway', path: paths.gatewayPaths.chatCompletions, method: 'POST',
      body: { model: 'fixture-chat-model', messages: [], stream: false },
      credential: { kind: 'api-key', value: credential.apiKey },
    })
    const chunks = []
    for await (const chunk of ctx.llm.stream({ provider: 'sub2api', model: 'fixture-chat-model', messages: [], tools: [tool] })) chunks.push(chunk)
    expect(chunks.some(chunk => chunk.type === 'text-delta')).toBe(true)
    const gatewayRequest = replay.requests.at(-1)
    expect(gatewayRequest?.headers.get('x-api-key')).toBe('fixture-gateway-api-key')
    expect(gatewayRequest?.headers.get('authorization')).toBeNull()
  })

  it('keeps tool calls fail-closed for unknown model metadata', async () => {
    const replay = new Sub2apiFixtureReplay(parseSub2apiFixture(gatewayFixture))
    const runtime = runtimeFor(replay)
    await runtime.login({ email: 'gateway@example.test', password: 'fixture-password' })
    await runtime.refreshModels()
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    ctx.provide('sub2api', runtime)
    new Sub2apiLlmProvider(ctx, { enabled: true, toolsEnabled: true })

    const chunks: unknown[] = []
    for await (const chunk of ctx.llm.stream({
      provider: 'sub2api',
      model: 'fixture-chat-model',
      messages: [],
      tools: [{ name: 'fixture_probe', description: 'Return a deterministic probe value.', parameters: { type: 'object', properties: {} } }],
    })) chunks.push(chunk)
    expect(chunks.at(-1)).toMatchObject({
      type: 'finish',
      reason: { kind: 'error', failure: { code: 'UNSUPPORTED_OPTION', message: 'Sub2API model "fixture-chat-model" has no verified tool support' } },
    })
  })

  it('completes login, persists only the grant, and single-flights model discovery', async () => {
    let modelRequests = 0
    let releaseModels: (() => void) | undefined
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) {
        return sub2apiFixtureJson({ data: { access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 3_600 } })
      }
      if (request.url.pathname.endsWith('/auth/me')) {
        return sub2apiFixtureJson({ data: { id: 'user-1', email: 'user@example.test' } })
      }
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') {
        return sub2apiFixtureJson({ data: [] })
      }
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-1', name: 'harness:fixture', key: 'api-secret', active: true } })
      }
      if (request.url.pathname.endsWith('/v1/models')) {
        modelRequests += 1
        await new Promise<void>((resolve) => { releaseModels = resolve })
        return sub2apiFixtureJson({ data: [{ id: 'model-1', name: 'Model One' }] })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const store = new MemorySub2apiCredentialStore()
    const runtime = runtimeFor(transport, store)

    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    expect(runtime.state()).toMatchObject({ status: 'authenticated', generation: 1, account: { userId: 'user-1' } })
    const stored = await store.readRecord(SUB2API_RECORD_KEY)
    expect(stored?.kind).toBe('grant')
    expect(JSON.stringify(runtime.state())).not.toContain('access-secret')
    expect(JSON.stringify(runtime.state())).not.toContain('refresh-secret')
    expect(JSON.stringify(runtime.state())).not.toContain('api-secret')
    expect(JSON.stringify(stored)).not.toContain('password-not-stored')

    const pending = Promise.all(Array.from({ length: 20 }, () => runtime.refreshModels()))
    while (releaseModels === undefined) await Promise.resolve()
    expect(modelRequests).toBe(1)
    releaseModels()
    const models = await pending
    expect(models[0]).toEqual([{ id: 'model-1', displayName: 'Model One', endpointFamily: 'unknown', supportsStreaming: 'unknown', supportsTools: 'unknown', supportsVision: 'unknown', supportsReasoning: 'unknown', supportsResponses: 'unknown', source: 'server-metadata' }])
  })

  it('updates the managed key group through the authenticated user API and persists it', async () => {
    let updateBody: unknown
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) return sub2apiFixtureJson({ data: { access_token: 'access-group-update' } })
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-group-update' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-group-update', name: 'harness:fixture', group_id: 1, key: 'api-group-update', active: true } })
      }
      if (request.url.pathname.endsWith('/keys/key-group-update') && request.method === 'PUT') {
        updateBody = request.body
        return sub2apiFixtureJson({ data: { id: 'key-group-update', name: 'harness:fixture', group_id: 9, active: true } })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const store = new MemorySub2apiCredentialStore()
    const runtime = runtimeFor(transport, store)

    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    await runtime.updateManagedKeyGroup(9)

    expect(updateBody).toEqual({ group_id: 9 })
    expect(runtime.state().apiKey).toMatchObject({ id: 'key-group-update', groupId: 9 })
    expect(await runtime.resolveGatewayCredential()).toMatchObject({ apiKey: 'api-group-update' })
    expect(await store.readRecord(SUB2API_RECORD_KEY)).toMatchObject({
      kind: 'grant',
      payload: { apiKey: { id: 'key-group-update', groupId: 9 } },
    })
  })

  it('loads named groups from the authenticated account API and caches them', async () => {
    let groupRequests = 0
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) return sub2apiFixtureJson({ data: { access_token: 'access-groups' } })
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-groups' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-groups', name: 'harness:fixture', group_id: 1, key: 'api-groups', active: true } })
      }
      if (request.url.pathname.endsWith('/groups/available')) {
        groupRequests += 1
        return sub2apiFixtureJson({ data: [
          { id: 1, name: '默认分组', platform: 'openai' },
          { id: 9, name: 'ThunderUni 编程', platform: 'openai' },
        ] })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const runtime = runtimeFor(transport)

    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    await expect(runtime.getAvailableGroups()).resolves.toEqual([
      { id: 1, name: '默认分组', platform: 'openai' },
      { id: 9, name: 'ThunderUni 编程', platform: 'openai' },
    ])
    await expect(runtime.getAvailableGroups()).resolves.toEqual([
      { id: 1, name: '默认分组', platform: 'openai' },
      { id: 9, name: 'ThunderUni 编程', platform: 'openai' },
    ])
    expect(groupRequests).toBe(1)
  })

  it('restores a persisted refresh-token session when a new runtime hydrates', async () => {
    let refreshCalls = 0
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) {
        return sub2apiFixtureJson({ data: { access_token: 'access-login', refresh_token: 'refresh-login', expires_in: 3_600 } })
      }
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-restart', email: 'restart@example.test' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-restart', name: 'harness:fixture', key: 'api-restart', active: true } })
      }
      if (request.url.pathname.endsWith('/auth/refresh')) {
        refreshCalls += 1
        expect(request.body).toEqual({ refresh_token: 'refresh-login' })
        return sub2apiFixtureJson({ data: { access_token: 'access-restarted', refresh_token: 'refresh-restarted', expires_in: 3_600 } })
      }
      if (request.url.pathname.endsWith('/v1/models')) {
        return sub2apiFixtureJson({ data: [{ id: 'restart-model', name: 'Restart Model' }] })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const store = new MemorySub2apiCredentialStore()
    await runtimeFor(transport, store).login({ email: 'restart@example.test', password: 'password-not-stored' })

    const restarted = runtimeFor(transport, store)
    await restarted.hydrate()

    expect(refreshCalls).toBe(1)
    expect(restarted.state()).toMatchObject({
      status: 'authenticated',
      account: { userId: 'user-restart', email: 'restart@example.test' },
      models: [{ id: 'restart-model', displayName: 'Restart Model' }],
    })
  })

  it('keeps a supported 2FA challenge separate from the password and completes it', async () => {
    let twoFactorBody: unknown
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) {
        return sub2apiFixtureJson({ data: { requires_2fa: true, temp_token: 'challenge-not-persisted' } })
      }
      if (request.url.pathname.endsWith('/auth/login/2fa')) {
        twoFactorBody = request.body
        return sub2apiFixtureJson({ data: { access_token: 'access-2fa' } })
      }
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-2fa' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-2fa', name: 'harness:fixture', key: 'api-2fa', active: true } })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const runtime = runtimeFor(transport)

    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    expect(runtime.state()).toMatchObject({ status: 'two-factor-required', generation: 0 })
    await runtime.submit2FA({ code: '123456' })
    expect(twoFactorBody).toEqual({ totp_code: '123456', temp_token: 'challenge-not-persisted' })
    expect(runtime.state()).toMatchObject({ status: 'authenticated', generation: 1, account: { userId: 'user-2fa' } })
  })

  it('fails closed when multiple active managed keys share the configured name', async () => {
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) return sub2apiFixtureJson({ data: { access_token: 'access-duplicate' } })
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-duplicate' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') {
        return sub2apiFixtureJson({ data: [
          { id: 'key-a', name: 'harness:fixture', group_id: 1, active: true },
          { id: 'key-b', name: 'harness:fixture', group_id: 1, active: true },
        ] })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const runtime = runtimeFor(transport)

    await expect(runtime.login({ email: 'user@example.test', password: 'password-not-stored' })).rejects.toMatchObject({
      code: 'SUB2API_PROTOCOL_MISMATCH',
    })
    expect(transport.requests.filter(request => request.method === 'POST')).toHaveLength(1)
    expect(runtime.state().status).toBe('authenticated')
  })

  it('does not reuse a same-named key from another gateway group', async () => {
    let createBody: unknown
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) return sub2apiFixtureJson({ data: { access_token: 'access-group' } })
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-group' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') {
        return sub2apiFixtureJson({ data: [{ id: 'wrong-group', name: 'harness:fixture', group_id: 2, active: true }] })
      }
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        createBody = request.body
        return sub2apiFixtureJson({ data: { id: 'right-group', name: 'harness:fixture', group_id: 1, key: 'api-group', active: true } })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const store = new MemorySub2apiCredentialStore()
    const runtime = runtimeFor(transport, store)

    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    expect(createBody).toEqual({ name: 'harness:fixture', group_id: 1 })
    const stored = await store.readRecord(SUB2API_RECORD_KEY)
    expect(stored).toMatchObject({ kind: 'grant', payload: { apiKey: { id: 'right-group', groupId: 1 } } })
  })

  it('rejects a newly-created key returned for another gateway group', async () => {
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) return sub2apiFixtureJson({ data: { access_token: 'access-wrong-created-group' } })
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-wrong-created-group' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'wrong-created-group', name: 'harness:fixture', group_id: 2, key: 'api-wrong-group', active: true } })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const runtime = runtimeFor(transport)

    await expect(runtime.login({ email: 'user@example.test', password: 'password-not-stored' })).rejects.toMatchObject({
      code: 'SUB2API_PROTOCOL_MISMATCH',
    })
    expect(runtime.state().status).toBe('authenticated')
  })

  it('refreshes once after an account 401 and replays the request once', async () => {
    let now = 1_000
    let meCalls = 0
    let refreshCalls = 0
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) {
        return sub2apiFixtureJson({ data: { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3_600 } })
      }
      if (request.url.pathname.endsWith('/auth/me')) {
        meCalls += 1
        if (meCalls === 2) return new Response('', { status: 401 })
        return sub2apiFixtureJson({ data: { id: 'user-1', email: 'user@example.test' } })
      }
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-1', name: 'harness:fixture', key: 'api-secret', active: true } })
      }
      if (request.url.pathname.endsWith('/auth/refresh')) {
        refreshCalls += 1
        return sub2apiFixtureJson({ data: { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3_600 } })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const runtime = runtimeFor(transport, new MemorySub2apiCredentialStore(), () => now)
    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    now = 2_000
    await expect(runtime.refreshAccount()).resolves.toMatchObject({ account: { userId: 'user-1' }, stale: false })
    expect(refreshCalls).toBe(1)
    expect(meCalls).toBe(3)
    expect(runtime.state().status).toBe('authenticated')
  })

  it('lets logout win over a late gateway response', async () => {
    let now = 1_000
    let releaseModels: (() => void) | undefined
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) return sub2apiFixtureJson({ data: { access_token: 'access-1' } })
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-1' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-1', name: 'harness:fixture', key: 'api-secret', active: true } })
      }
      if (request.url.pathname.endsWith('/v1/models')) {
        await new Promise<void>((resolve) => { releaseModels = resolve })
        return sub2apiFixtureJson({ data: [{ id: 'late-model' }] })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const store = new MemorySub2apiCredentialStore()
    const runtime = runtimeFor(transport, store, () => now)
    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    now = 2_000
    const pending = runtime.refreshModels()
    while (releaseModels === undefined) await Promise.resolve()
    await runtime.logout()
    releaseModels()
    await expect(pending).rejects.toMatchObject({ code: 'SUB2API_CANCELLED' })
    expect(runtime.state()).toMatchObject({ status: 'signed-out' })
    expect(store.deletes).toContain(SUB2API_RECORD_KEY)
  })

  it('does not turn a late account refresh into a stale success after logout', async () => {
    let now = 1_000
    let meCalls = 0
    let releaseAccount: (() => void) | undefined
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) return sub2apiFixtureJson({ data: { access_token: 'access-1' } })
      if (request.url.pathname.endsWith('/auth/me')) {
        meCalls += 1
        if (meCalls === 2) await new Promise<void>((resolve) => { releaseAccount = resolve })
        return sub2apiFixtureJson({ data: { id: 'user-1' } })
      }
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-1', name: 'harness:fixture', key: 'api-secret', active: true } })
      }
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const store = new MemorySub2apiCredentialStore()
    const runtime = runtimeFor(transport, store, () => now)

    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    now = 2_000
    const pending = runtime.refreshAccount()
    while (releaseAccount === undefined) await Promise.resolve()
    await runtime.logout()
    releaseAccount()
    await expect(pending).rejects.toMatchObject({ code: 'SUB2API_CANCELLED' })
    expect(runtime.state()).toMatchObject({ status: 'signed-out' })
  })

  it('rejects an unapproved recharge origin', async () => {
    const transport = new Sub2apiFixtureTransport(async (request) => {
      if (request.url.pathname.endsWith('/auth/login')) return sub2apiFixtureJson({ data: { access_token: 'access-recharge' } })
      if (request.url.pathname.endsWith('/auth/me')) return sub2apiFixtureJson({ data: { id: 'user-recharge' } })
      if (request.url.pathname.endsWith('/keys') && request.method === 'GET') return sub2apiFixtureJson({ data: [] })
      if (request.url.pathname.endsWith('/keys') && request.method === 'POST') {
        return sub2apiFixtureJson({ data: { id: 'key-recharge', name: 'harness:fixture', key: 'api-recharge', active: true } })
      }
      if (request.url.pathname.endsWith('/billing/recharge')) return sub2apiFixtureJson({ data: { url: 'https://evil.example.test/pay' } })
      throw new Error(`unexpected fixture request: ${request.method} ${request.url.pathname}`)
    })
    const runtime = runtimeFor(transport)

    await runtime.login({ email: 'user@example.test', password: 'password-not-stored' })
    await expect(runtime.getRechargeUrl()).rejects.toMatchObject({ code: 'SUB2API_RECHARGE_UNAVAILABLE' })
  })

  it('does not refresh a grant after the deployment fingerprint changes', async () => {
    const store = new MemorySub2apiCredentialStore()
    await store.modifyRecord(SUB2API_RECORD_KEY, async () => ({
      kind: 'grant',
      payload: {
        version: 1,
        deployment: { origin: 'https://account.example.test', fingerprint: 'old-deployment' },
        account: { userId: 'user-old' },
        auth: { refreshToken: 'refresh-old' },
        apiKey: { id: 'key-old', name: 'harness:fixture', secret: 'api-old' },
        generation: 4,
        updatedAt: 10,
      },
    }))
    const transport = new Sub2apiFixtureTransport(async (request) => {
      throw new Error(`unexpected request after deployment change: ${request.method} ${request.url.pathname}`)
    })
    const runtime = runtimeFor(transport, store)

    await expect(runtime.resolveGatewayCredential()).rejects.toMatchObject({ code: 'SUB2API_REAUTH_REQUIRED' })
    expect(transport.requests).toHaveLength(0)
    expect(runtime.state()).toMatchObject({ status: 'reauth-required', generation: 4 })
  })
})
