import { Context, Service } from '@deepseek-ai/cordis'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'
import { Sub2apiError } from './errors.ts'
import type {
  Sub2apiAccountSnapshot,
  Sub2apiGatewayCredential,
  Sub2apiGroupDescriptor,
  Sub2apiLoginInput,
  Sub2apiModelDescriptor,
  Sub2apiRegisterInput,
  Sub2apiProtocolProfile,
  Sub2apiPublicSettings,
  Sub2apiStateView,
  Sub2apiTwoFactorInput,
  Sub2apiUsageSnapshot,
} from './types.ts'
import { Sub2apiRuntimeService } from './service.ts'
import type { Sub2apiRuntime, Sub2apiRuntimeOptions } from './service.ts'
import { Sub2apiHttpClient } from './http.ts'
import { resolveSub2apiProfile, sub2apiDeploymentFingerprint } from './profile.ts'
import type { Sub2apiProfileInput } from './profile.ts'
import { Sub2apiLlmProvider } from './llm.ts'
import type { Sub2apiLlmOptions } from './llm.ts'
import { Sub2apiRemoteController } from './remote.ts'
import { SUB2API_RECORD_KEY } from './service.ts'
import { SUB2API_MODEL_SETTINGS_NAMESPACE, Sub2apiModelSettingsSchema } from './model-settings.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sub2api: Sub2apiService
  }
}

/** Options for the Cordis façade; the credential provider comes from the context. */
export interface Sub2apiServiceOptions extends Omit<Sub2apiRuntimeOptions, 'credentials' | 'http' | 'profile' | 'deploymentFingerprint'> {
  /** Normalized profile or plain fields accepted by a Cordis patch. */
  readonly profile: Sub2apiProtocolProfile | Sub2apiProfileInput
  /** Deployment fingerprint as text; the service brands it before persistence. */
  readonly deploymentFingerprint: string
  /** Optional prebuilt transport for embedders and protocol fixtures. */
  readonly http?: Sub2apiHttpClient
  /** Explicit transport limits used when the service creates the local transport. */
  readonly httpOptions?: {
    readonly maxResponseBytes: number
    readonly timeoutMs: number
    readonly maxRedirects: number
  }
  /** Optional, fail-closed model-gateway registration. */
  readonly llm?: Sub2apiLlmOptions
}

/** Cordis Service Provider that mounts one configured Sub2API runtime. */
export class Sub2apiService extends Service implements Sub2apiRuntime {
  static inject = ['credentials']

  private readonly runtime: Sub2apiRuntimeService

  /**
   * Mount a runtime using the already-installed credential provider.
   * @param ctx - owning Cordis context.
   * @param options - deployment-specific profile, transport, and policies.
   */
  constructor(ctx: Context, options: Sub2apiServiceOptions) {
    super(ctx, 'sub2api')
    const credentials = ctx.get('credentials')
    if (credentials === undefined) throw new Error('sub2api: credentials service unavailable')
    const { llm: llmOptions, http: configuredHttp, httpOptions, profile: profileInput, deploymentFingerprint, ...runtimeOptions } = options
    const profile = resolveServiceProfile(profileInput)
    const http = configuredHttp ?? createConfiguredHttp(profile, httpOptions)
    const settings = ctx.get('settings')
    const modelSettingsScope = settings?.register(SUB2API_MODEL_SETTINGS_NAMESPACE, Sub2apiModelSettingsSchema)
    const modelSettings = modelSettingsScope === undefined
      ? runtimeOptions.modelSettings
      : {
        get: () => modelSettingsScope.get().modelOverrides,
        update: (modelId: string, override: { readonly contextWindow?: number }) =>
          modelSettingsScope.update({ modelOverrides: { [modelId]: override } }),
      }
    this.runtime = new Sub2apiRuntimeService({
      ...runtimeOptions,
      ...(modelSettings === undefined ? {} : { modelSettings }),
      profile,
      deploymentFingerprint: sub2apiDeploymentFingerprint(deploymentFingerprint),
      http,
      credentials,
    })
    let modelCatalogKey = JSON.stringify(null)
    ctx.effect(
      () => this.runtime.subscribe((state) => {
        ctx.emit('sub2api/state-changed', state)
        const nextModelCatalogKey = JSON.stringify(state.models ?? null)
        if (nextModelCatalogKey === modelCatalogKey) return
        modelCatalogKey = nextModelCatalogKey
        ctx.emit('llm/adapters-updated')
      }),
      'sub2api: state projection events',
    )
    if (modelSettingsScope !== undefined) {
      ctx.effect(
        () => modelSettingsScope.watch(() => this.runtime.refreshModelSettings()),
        'sub2api: model settings updates',
      )
    }
    if (llmOptions?.enabled === true) ctx.plugin(Sub2apiLlmProvider, llmOptions)
    ctx.plugin(Sub2apiRemoteController)
    ctx.inject(['authorization'], (authorization) => {
      registerSub2apiAuthorizationFlow(authorization, this.runtime)
    })
  }

  /**
   * Read the current secret-free runtime state.
   * @returns the detached runtime state.
   */
  state(): Sub2apiStateView {
    return this.runtime.state()
  }

  /**
   * Read normalized deployment facts without any credential value.
   * @returns the configured protocol profile.
   */
  profile(): Sub2apiProtocolProfile {
    return this.runtime.profile()
  }

  /**
   * Subscribe to account and catalog projections.
   * @param listener - callback receiving a detached state view.
   * @returns the subscription disposer.
   */
  subscribe(listener: (state: Sub2apiStateView) => void): () => void {
    return this.runtime.subscribe(listener)
  }

  /**
   * Load the persisted grant record.
   * @returns resolution after the record has been validated.
   */
  hydrate(): Promise<void> {
    return this.runtime.hydrate()
  }

  /**
   * Register an account through the mounted runtime.
   * @param input - registration fields.
   * @param signal - optional cancellation signal.
   * @returns resolution after authentication and key reconciliation.
   */
  register(input: Sub2apiRegisterInput, signal?: AbortSignal): Promise<void> {
    return this.runtime.register(input, signal)
  }

  /**
   * Log in an account through the mounted runtime.
   * @param input - login fields.
   * @param signal - optional cancellation signal.
   * @returns resolution after authentication and key reconciliation.
   */
  login(input: Sub2apiLoginInput, signal?: AbortSignal): Promise<void> {
    return this.runtime.login(input, signal)
  }

  /**
   * Complete the mounted runtime's pending second-factor challenge.
   * @param input - second-factor code.
   * @param signal - optional cancellation signal.
   * @returns resolution after authentication and key reconciliation.
   */
  submit2FA(input: Sub2apiTwoFactorInput, signal?: AbortSignal): Promise<void> {
    return this.runtime.submit2FA(input, signal)
  }

  /**
   * Clear local account state while retaining the server-side managed Key.
   * @returns resolution after local cleanup.
   */
  logout(): Promise<void> {
    return this.runtime.logout()
  }

  /**
   * Refresh and return the current account summary.
   * @param signal - optional cancellation signal.
   * @returns the account summary and freshness metadata.
   */
  refreshAccount(signal?: AbortSignal): Promise<Sub2apiAccountSnapshot> {
    return this.runtime.refreshAccount(signal)
  }

  /**
   * Refresh and return models visible to the managed API Key.
   * @param signal - optional cancellation signal.
   * @returns model descriptors visible to the managed Key.
   */
  refreshModels(signal?: AbortSignal): Promise<readonly Sub2apiModelDescriptor[]> {
    return this.runtime.refreshModels(signal)
  }

  /** Re-apply settings changed by another settings consumer. */
  refreshModelSettings(): void {
    this.runtime.refreshModelSettings()
  }

  /** Persist and apply a model's context-window override. */
  updateModelSettings(input: import('./types.ts').Sub2apiModelSettingsInput): Promise<void> {
    return this.runtime.updateModelSettings(input)
  }

  /** Update the authenticated user's managed API Key group.
   * @param groupId - positive server-side group identifier.
   * @param signal - optional cancellation signal.
   * @returns resolution after the server and durable local record agree.
   */
  updateManagedKeyGroup(groupId: number, signal?: AbortSignal): Promise<void> {
    return this.runtime.updateManagedKeyGroup(groupId, signal)
  }

  /**
   * Refresh and return named groups available to the authenticated account.
   * @param signal - optional cancellation signal for the group request.
   * @returns named group descriptors.
   */
  getAvailableGroups(signal?: AbortSignal): Promise<readonly Sub2apiGroupDescriptor[]> {
    return this.runtime.getAvailableGroups(signal)
  }

  /**
   * Refresh or return the bounded usage and balance snapshot.
   * @param signal - optional cancellation signal.
   * @returns usage and balance data with freshness metadata.
   */
  getUsage(signal?: AbortSignal): Promise<Sub2apiUsageSnapshot> {
    return this.runtime.getUsage(signal)
  }

  /**
   * Read unauthenticated deployment capability settings.
   * @param signal - optional cancellation signal for the public-settings request.
   * @returns public settings, or `undefined` when the profile has no endpoint.
   */
  getPublicSettings(signal?: AbortSignal): Promise<Sub2apiPublicSettings | undefined> {
    return this.runtime.getPublicSettings(signal)
  }

  /**
   * Return the validated recharge URL, when the profile exposes one.
   * @param signal - optional cancellation signal.
   * @returns the approved URL, or `undefined` when the service returned none.
   */
  getRechargeUrl(signal?: AbortSignal): Promise<string | undefined> {
    return this.runtime.getRechargeUrl(signal)
  }

  /**
   * Return the Host-only API Key snapshot for a model provider.
   * @param signal - optional cancellation signal.
   * @returns the deployment-bound managed Key snapshot.
   */
  resolveGatewayCredential(signal?: AbortSignal): Promise<Sub2apiGatewayCredential> {
    return this.runtime.resolveGatewayCredential(signal)
  }

  /**
   * Return the deployment-validated fetch used by the model provider.
   * @returns a fetch function that applies the runtime destination policy.
   */
  createValidatedFetch(): typeof globalThis.fetch {
    return this.runtime.createValidatedFetch()
  }
}

export default Sub2apiService

/** Register the shared desktop, headless, and CLI login conversation. */
function registerSub2apiAuthorizationFlow(
  authorizationContext: Context,
  runtime: Sub2apiRuntime,
): void {
  authorizationContext.authorization.registerFlow({
    key: SUB2API_RECORD_KEY,
    label: 'Sub2API account',
    methods: [
      { id: 'login', label: 'Sign in' },
      { id: 'register', label: 'Create account' },
    ],
    async run(session: AuthorizationSession): Promise<void> {
      const email = await session.prompt({ kind: 'text', message: 'Sub2API email address' })
      const password = await session.prompt({ kind: 'secret', message: 'Sub2API password' })
      if (session.method === 'register') {
        const verificationCode = await session.prompt({
          kind: 'text',
          message: 'Registration code (leave blank when not required)',
        })
        await runtime.register({ email, password, ...(verificationCode === '' ? {} : { verificationCode }) }, session.signal)
      } else {
        await runtime.login({ email, password }, session.signal)
      }
      if (runtime.state().status === 'two-factor-required') {
        const code = await session.prompt({ kind: 'secret', message: 'Two-factor authentication code' })
        await runtime.submit2FA({ code }, session.signal)
      }
    },
  })
}

function resolveServiceProfile(input: Sub2apiProtocolProfile | Sub2apiProfileInput): Sub2apiProtocolProfile {
  if ('account' in input && 'gateway' in input) return input
  return resolveSub2apiProfile(input)
}

function createConfiguredHttp(
  profile: Sub2apiProtocolProfile,
  options: Sub2apiServiceOptions['httpOptions'],
): Sub2apiHttpClient {
  if (options === undefined) throw new Error('sub2api: http or explicit httpOptions is required')
  const origins = new Set([new URL(profile.accountBaseUrl).origin, new URL(profile.gatewayBaseUrl).origin])
  return new Sub2apiHttpClient({
    profile,
    ...options,
    validateDestination: async (url) => {
      if (!origins.has(url.origin)) {
        throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API request destination is outside the configured deployment origins')
      }
      if (!isIpLiteral(url.hostname)) {
        throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API hostname destinations require an injected resolver and pinned transport')
      }
    },
  })
}

function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/gu, '')
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return true
  return host.includes(':') && /^[0-9a-f:]+$/iu.test(host)
}
