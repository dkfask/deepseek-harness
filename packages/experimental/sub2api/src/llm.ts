/** Sub2API model-gateway adapter over the shared Harness LLM seam. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { RetryPolicyConfig, StreamChunk, GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, ResolvedRetryPolicy } from '@deepseek-ai/dsh-llm'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import { authContextFrom, credentialStoreFrom, createDynamicPiAiProfile, PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { Sub2apiError } from './errors.ts'
import type { Sub2apiModelDescriptor, Sub2apiProtocolProfile } from './types.ts'
import type { Sub2apiRuntime } from './service.ts'

// The OpenAI-compatible pi-ai adapter requires a non-empty apiKey even when
// the deployment authenticates with x-api-key. The sentinel is deliberately
// non-secret; Authorization is removed before Fetch and the real key remains
// only in x-api-key.
const SUB2API_API_KEY_HEADER_SENTINEL = 'sub2api-api-key-header'

/** Settings for the opt-in Sub2API LLM route. */
export interface Sub2apiLlmOptions {
  /** Register the `sub2api` route. Defaults to disabled. */
  readonly enabled?: boolean
  /** Reserved Responses capability flag; remains gated by independent fixture evidence. */
  readonly responsesEnabled?: boolean
  /** Allow model tool schemas only after each advertised model is verified. */
  readonly toolsEnabled?: boolean
  /** Model ids with independently verified tool-call support when metadata is unknown. */
  readonly verifiedToolsModels?: readonly string[]
  /** Explicit capacity used only when gateway metadata omits it. */
  readonly defaultContextWindow?: number
  /** Explicit output capacity used only when gateway metadata omits it. */
  readonly defaultMaxTokens?: number
  /** Treat model rows without an endpoint marker as verified Chat Completions rows. */
  readonly verifiedChatCompletions?: boolean
  /** Treat model rows without a streaming marker as verified SSE rows. */
  readonly verifiedStreaming?: boolean
  /** Provider retry policy captured by the LLM registry. */
  readonly retryPolicy?: RetryPolicyConfig
}

/** Cordis service that owns the opt-in Sub2API adapter registration. */
export class Sub2apiLlmProvider extends Service {
  static inject = ['llm', 'sub2api']

  /**
   * Register one dynamic route when the feature flag is explicitly enabled.
   * @param ctx - context containing the LLM and Sub2API services.
   * @param options - opt-in route policy.
   */
  constructor(ctx: Context, options: Sub2apiLlmOptions = {}) {
    super(ctx, 'sub2apiLlm')
    if (options.enabled !== true) return
    const runtime = ctx.sub2api
    const adapter = createAdapter(ctx, runtime, options)
    ctx.llm.registerAdapter(['sub2api'], adapter)
  }
}

function createAdapter(ctx: Context, runtime: Sub2apiRuntime, options: Sub2apiLlmOptions): LlmAdapter {
  const delegate = new PiAiAdapter({
    profiles: () => profilesOf(runtime, options),
    resolveApiKey: async (_provider, _profile) => {
      try {
        const credential = await runtime.resolveGatewayCredential()
        return credential.apiKey
      } catch (error: unknown) {
        throw toLlmError(error)
      }
    },
    resolveRequestAuth: (_provider, _profile, apiKey) => {
      const scheme = runtime.profile().gateway.authScheme
      if (apiKey === undefined) return {}
      return {
        ...(scheme === 'api-key' ? { apiKey: SUB2API_API_KEY_HEADER_SENTINEL } : { apiKey }),
        ...(scheme === 'api-key'
          ? { headers: { 'x-api-key': apiKey, Authorization: null } }
          : scheme === 'both'
            ? { headers: { 'x-api-key': apiKey } }
            : {}),
      }
    },
    resolveFetch: () => runtime.createValidatedFetch(),
    auth: {
      credentials: credentialStoreFrom(ctx),
      authContext: authContextFrom(ctx),
    },
  })
  return new Sub2apiLlmAdapter(delegate, runtime, options)
}

/** Adapter guard that keeps unsupported tool and protocol capabilities fail-closed. */
class Sub2apiLlmAdapter extends LlmAdapter {
  constructor(
    private readonly delegate: PiAiAdapter,
    private readonly runtime: Sub2apiRuntime,
    private readonly options: Sub2apiLlmOptions,
  ) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return this.delegate.providerInfo(provider)
  }

  override providerRetryPolicy(provider: string): ResolvedRetryPolicy | undefined {
    return this.delegate.providerRetryPolicy(provider)
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return this.delegate.listModels(provider)
  }

  override resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.delegate.resolveModel(provider, model, signal)
  }

  override prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    return this.delegate.prepareCall(provider, model, signal).then(prepared => ({
      model: prepared.model,
      stream: (options) => {
        this.assertRequestCapabilities(options)
        return prepared.stream(options)
      },
    }))
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.assertRequestCapabilities(options)
    return this.delegate.stream(options)
  }

  private assertRequestCapabilities(options: GenerateOptions): void {
    if (options.tools !== undefined && options.tools.length > 0) {
      if (this.options.toolsEnabled !== true) {
        throw new LlmError('Sub2API tools are disabled until a tool-capability fixture is verified', 'UNSUPPORTED_OPTION')
      }
      const descriptor = this.runtime.state().models?.find(model => model.id === options.model)
      if (descriptor?.supportsTools !== 'verified' && !this.options.verifiedToolsModels?.includes(options.model)) {
        throw new LlmError(`Sub2API model "${options.model}" has no verified tool support`, 'UNSUPPORTED_OPTION')
      }
    }
    if (this.options.responsesEnabled === true) {
      const descriptor = this.runtime.state().models?.find(model => model.id === options.model)
      if (descriptor?.endpointFamily === 'responses') {
        throw new LlmError('Sub2API Responses support is reserved until an independent fixture is verified', 'PROTOCOL_MISMATCH')
      }
    }
  }
}

function profilesOf(runtime: Sub2apiRuntime, options: Sub2apiLlmOptions): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
  const protocol = runtime.profile()
  const descriptors = runtime.state().models ?? []
  const models = descriptors
    .filter(descriptor => isChatModel(descriptor, options))
    .map(descriptor => ({
      id: descriptor.id,
      ...(descriptor.displayName === undefined ? {} : { name: descriptor.displayName }),
      ...(descriptor.contextWindow === undefined ? {} : { contextWindow: descriptor.contextWindow }),
      ...(descriptor.maxOutputTokens === undefined ? {} : { maxTokens: descriptor.maxOutputTokens }),
      // Reasoning needs a protocol-specific mapping, not only a capability bit.
      reasoning: false,
    }))
  const profile = createDynamicPiAiProfile({
    provider: 'sub2api',
    displayName: 'ThunderUni',
    api: 'openai-completions',
    baseURL: gatewayApiBaseUrl(protocol),
    models,
    ...(options.defaultContextWindow === undefined ? {} : { defaultContextWindow: options.defaultContextWindow }),
    ...(options.defaultMaxTokens === undefined ? {} : { defaultMaxTokens: options.defaultMaxTokens }),
    ...(options.retryPolicy === undefined ? {} : { retryPolicy: options.retryPolicy }),
  })
  return new Map([['sub2api', profile]])
}

function isChatModel(descriptor: Sub2apiModelDescriptor, options: Sub2apiLlmOptions): boolean {
  if (descriptor.endpointFamily !== 'chat-completions'
    && !(descriptor.endpointFamily === 'unknown' && options.verifiedChatCompletions === true)) return false
  if (descriptor.supportsStreaming !== 'verified'
    && !(descriptor.supportsStreaming === 'unknown' && options.verifiedStreaming === true)) return false
  if (descriptor.contextWindow === undefined && options.defaultContextWindow === undefined) return false
  if (descriptor.maxOutputTokens === undefined && options.defaultMaxTokens === undefined) return false
  return true
}

function gatewayApiBaseUrl(profile: Sub2apiProtocolProfile): string {
  const endpoint = new URL(profile.gateway.paths.chatCompletions, profile.gatewayBaseUrl)
  const suffix = '/chat/completions'
  if (endpoint.search !== '' || !endpoint.pathname.endsWith(suffix)) {
    throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API chat-completions path must end with /chat/completions')
  }
  endpoint.pathname = endpoint.pathname.slice(0, -suffix.length) || '/'
  return endpoint.toString().replace(/\/$/, '')
}

function toLlmError(error: unknown): LlmError {
  if (!(error instanceof Sub2apiError)) {
    return new LlmError('Sub2API gateway authentication failed', 'PROVIDER_ERROR', { cause: error })
  }
  const options = error.httpStatus === undefined && error.retryAfterMs === undefined
    ? { cause: error }
    : {
      cause: error,
      ...(error.httpStatus === undefined ? {} : { status: error.httpStatus }),
      ...(error.retryAfterMs === undefined ? {} : { providerRetryAfterMs: error.retryAfterMs }),
    }
  switch (error.code) {
    case 'SUB2API_NOT_AUTHENTICATED':
    case 'SUB2API_REAUTH_REQUIRED':
    case 'SUB2API_KEY_REQUIRED': return new LlmError(error.message, 'MISSING_CREDENTIAL', options)
    case 'SUB2API_KEY_INVALID': return new LlmError(error.message, 'AUTH', options)
    case 'SUB2API_INSUFFICIENT_BALANCE': return new LlmError(error.message, 'QUOTA', options)
    case 'SUB2API_FORBIDDEN': return new LlmError(error.message, 'FORBIDDEN', options)
    case 'SUB2API_MODEL_UNAVAILABLE': return new LlmError(error.message, 'UNKNOWN_MODEL', options)
    case 'SUB2API_RATE_LIMITED': return new LlmError(error.message, 'RATE_LIMIT', options)
    case 'SUB2API_TIMEOUT': return new LlmError(error.message, 'TIMEOUT', options)
    case 'SUB2API_CANCELLED': return new LlmError(error.message, 'ABORTED', options)
    case 'SUB2API_BAD_REQUEST': return new LlmError(error.message, 'INVALID_REQUEST', options)
    case 'SUB2API_BAD_RESPONSE':
    case 'SUB2API_PROTOCOL_MISMATCH': return new LlmError(error.message, 'PROTOCOL_MISMATCH', options)
    case 'SUB2API_SERVICE_UNAVAILABLE': return new LlmError(error.message, 'SERVER', options)
    case 'SUB2API_2FA_REQUIRED':
    case 'SUB2API_2FA_UNSUPPORTED':
    case 'SUB2API_ACCOUNT_UNAVAILABLE':
    case 'SUB2API_RECHARGE_UNAVAILABLE':
    case 'SUB2API_ADMIN_COMPLIANCE_REQUIRED': return new LlmError(error.message, 'PROVIDER_ERROR', options)
  }
}
