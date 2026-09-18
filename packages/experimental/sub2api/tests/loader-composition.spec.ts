/** The Sub2API Host service mounts through the same Loader path used by shipped profiles. */

import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MemorySub2apiCredentialStore,
  Sub2apiService,
} from '../src/index.ts'

let context: Context | undefined

afterEach(async () => {
  vi.unstubAllGlobals()
  await context?.fiber.dispose()
  context = undefined
})

describe('Sub2API Loader composition', () => {
  it('mounts the configured Host service, Remote owner, and authorization flow', async () => {
    const credentials = new MemorySub2apiCredentialStore()
    const credentialProvider = {
      apply(ctx: Context): void {
        ctx.provide('credentials', credentials)
      },
    }
    const modules = new Map<string, unknown>([
      ['test-credentials', credentialProvider],
      ['@deepseek-ai/dsh-authorization', AuthorizationService],
      ['@deepseek-ai/dsh-experimental-sub2api', Sub2apiService],
    ])

    context = new Context()
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        const module = modules.get(specifier)
        if (module === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
        return module
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: {
        path: new URL('./fixtures/loader.cordis.yml', import.meta.url).href,
        patches: [{
          insert: [
            { id: 'credentials', name: 'test-credentials' },
            { id: 'authorization', name: '@deepseek-ai/dsh-authorization' },
            {
              id: 'sub2api',
              name: '@deepseek-ai/dsh-experimental-sub2api',
              config: {
                profile: {
                  version: 'sub2api-loader-fixture',
                  accountBaseUrl: 'http://127.0.0.1:8090/api/v1',
                  gatewayBaseUrl: 'http://127.0.0.1:8090',
                  accountPaths: {
                    login: '/auth/login',
                    register: '/auth/register',
                    me: '/auth/me',
                    apiKeys: '/keys',
                    usage: '/usage/dashboard/stats',
                  },
                  gatewayPaths: { models: '/v1/models', chatCompletions: '/v1/chat/completions' },
                  allowInsecureHttpOrigins: ['http://127.0.0.1:8090'],
                },
                deploymentFingerprint: 'sub2api-loader-fixture',
                managedKeyName: 'dsh:loader-fixture',
                managedKeyGroupId: 1,
                cacheTtlMs: { account: 30_000, models: 30_000, groups: 30_000, usage: 30_000, publicSettings: 300_000 },
                refreshSkewMs: 60_000,
                persistRefreshToken: false,
                httpOptions: { maxResponseBytes: 1_048_576, timeoutMs: 30_000, maxRedirects: 0 },
              },
            },
          ],
        }],
      },
    })
    await context.loader.await()

    expect(context.get('sub2api')).toBeInstanceOf(Sub2apiService)
    expect(context.sub2api.profile().accountBaseUrl).toBe('http://127.0.0.1:8090/api/v1')
    expect(context.sub2api.state()).toMatchObject({ status: 'signed-out', generation: 0 })
    expect(context.authorization.list()).toEqual([expect.objectContaining({ label: 'Sub2API account' })])
    expect(context.get('sub2apiRemote')).toBeDefined()
  })

  it('announces a refreshed model catalog through the LLM update event', async () => {
    const credentials = new MemorySub2apiCredentialStore()
    const credentialProvider = {
      apply(ctx: Context): void {
        ctx.provide('credentials', credentials)
      },
    }
    const modules = new Map<string, unknown>([
      ['test-credentials', credentialProvider],
      ['@deepseek-ai/dsh-authorization', AuthorizationService],
      ['@deepseek-ai/dsh-experimental-sub2api', Sub2apiService],
    ])
    const responses = new Map<string, unknown>([
      ['POST /auth/login', { data: { access_token: 'access-token' } }],
      ['GET /auth/me', { data: { id: 'user-1', email: 'user@example.test', balance: 100 } }],
      ['GET /keys', { data: { items: [] } }],
      ['POST /keys', { data: { id: 1, name: 'dsh:loader-fixture', key: 'gateway-key', status: 'active' } }],
      ['GET /v1/models', { data: [{ id: 'model-1', name: 'Model One', endpoint_family: 'chat-completions', supports_streaming: true, context_window: 131072, max_output_tokens: 8192 }] }],
    ])
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : undefined
      const method = init?.method ?? request?.method ?? 'GET'
      const url = new URL(request?.url ?? String(input))
      const response = responses.get(`${method} ${url.pathname.replace('/api/v1', '')}`)
      if (response === undefined) return new Response('not found', { status: 404 })
      return Response.json(response)
    }))

    context = new Context()
    let topologyUpdates = 0
    context.on('llm/adapters-updated', () => { topologyUpdates += 1 })
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        const module = modules.get(specifier)
        if (module === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
        return module
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: {
        path: new URL('./fixtures/loader.cordis.yml', import.meta.url).href,
        patches: [{
          insert: [
            { id: 'credentials', name: 'test-credentials' },
            { id: 'authorization', name: '@deepseek-ai/dsh-authorization' },
            {
              id: 'sub2api',
              name: '@deepseek-ai/dsh-experimental-sub2api',
              config: {
                profile: {
                  version: 'sub2api-loader-fixture',
                  accountBaseUrl: 'http://127.0.0.1:8090/api/v1',
                  gatewayBaseUrl: 'http://127.0.0.1:8090',
                  accountPaths: { login: '/auth/login', register: '/auth/register', me: '/auth/me', apiKeys: '/keys', usage: '/usage/dashboard/stats' },
                  gatewayPaths: { models: '/v1/models', chatCompletions: '/v1/chat/completions' },
                  allowInsecureHttpOrigins: ['http://127.0.0.1:8090'],
                },
                deploymentFingerprint: 'sub2api-loader-fixture',
                managedKeyName: 'dsh:loader-fixture',
                managedKeyGroupId: 1,
                cacheTtlMs: { account: 30_000, models: 30_000, groups: 30_000, usage: 30_000, publicSettings: 300_000 },
                refreshSkewMs: 60_000,
                persistRefreshToken: false,
                httpOptions: { maxResponseBytes: 1_048_576, timeoutMs: 30_000, maxRedirects: 0 },
              },
            },
          ],
        }],
      },
    })
    await context.loader.await()

    await context.sub2api.login({ email: 'user@example.test', password: 'password' })
    await context.sub2api.refreshModels()

    expect(context.sub2api.state().models).toHaveLength(1)
    expect(topologyUpdates).toBe(1)
  })
})
