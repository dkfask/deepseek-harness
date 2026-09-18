import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialKey,
  CredentialRecord,
} from '@deepseek-ai/dsh-credentials'
import { Sub2apiError } from './errors.ts'
import { Sub2apiHttpClient } from './http.ts'
import type { Sub2apiModelOverride, Sub2apiModelSettingsStore } from './model-settings.ts'
import { normalizeSub2apiOrigin } from './profile.ts'
import { parseSub2apiPayload } from './protocol.ts'
import { parseSub2apiGrantRecord, sub2apiSecret } from './record.ts'
import {
  applySub2apiStateEvent,
  createSub2apiSnapshot,
  Sub2apiGenerationGuard,
} from './state.ts'
import type {
  Sub2apiAccountSnapshot,
  Sub2apiAccountSummary,
  Sub2apiApiKeyDescriptor,
  Sub2apiApiKeyView,
  Sub2apiAuthenticationResult,
  Sub2apiDeploymentFingerprint,
  Sub2apiGatewayCredential,
  Sub2apiGroupDescriptor,
  Sub2apiLoginInput,
  Sub2apiModelDescriptor,
  Sub2apiModelSettingsInput,
  Sub2apiProtocolProfile,
  Sub2apiPublicSettings,
  Sub2apiRegisterInput,
  Sub2apiGrantRecordV1,
  Sub2apiStateEvent,
  Sub2apiStateView,
  Sub2apiTwoFactorInput,
  Sub2apiUsageSnapshot,
} from './types.ts'

/** The credential-record address owned by this capability. */
export const SUB2API_RECORD_KEY: CredentialKey = credentialKey('sub2api', 'user-session')

/** Minimal credential record surface required by the Host runtime. */
export interface Sub2apiCredentialStore {
  /** Read the owner-defined grant record. */
  readRecord(key: CredentialKey): Promise<CredentialRecord | undefined>
  /** Atomically decide and write the next owner-defined grant record. */
  modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined>
  /** Remove the local grant without revoking the server-side API Key. */
  deleteRecord(key: CredentialKey): Promise<void>
}

/** Protocol-specific request and response mapping supplied by verified fixtures. */
export interface Sub2apiProtocolCodec {
  /** Encode a registration request without retaining the password. */
  encodeRegister(input: Sub2apiRegisterInput): unknown
  /** Encode a login request without retaining the password. */
  encodeLogin(input: Sub2apiLoginInput): unknown
  /** Encode a second-factor request and its short-lived challenge. */
  encodeTwoFactor(input: Sub2apiTwoFactorInput, challenge: string | undefined): unknown
  /** Encode a refresh request. */
  encodeRefresh(refreshToken: string): unknown
  /** Decode a login, registration, 2FA, or refresh result. */
  decodeAuthentication(payload: unknown): Sub2apiAuthenticationResult
  /** Decode the current-user response. */
  decodeAccount(payload: unknown): Sub2apiAccountSummary
  /** Decode the user API Key list response. */
  decodeApiKeys(payload: unknown): readonly Sub2apiApiKeyDescriptor[]
  /** Decode groups available to the authenticated account. */
  decodeGroups(payload: unknown): readonly Sub2apiGroupDescriptor[]
  /** Decode one updated user API Key response without requiring its secret. */
  decodeApiKey(payload: unknown): Sub2apiApiKeyDescriptor
  /** Decode a newly-created API Key response; the secret must be present. */
  decodeCreatedApiKey(payload: unknown): Sub2apiApiKeyDescriptor
  /** Decode the model-list response without guessing model capabilities. */
  decodeModels(payload: unknown): readonly Sub2apiModelDescriptor[]
  /** Decode account balance/usage data. */
  decodeUsage(payload: unknown, at: number): Sub2apiUsageSnapshot
  /** Decode unauthenticated deployment capability settings. */
  decodePublicSettings(payload: unknown): Sub2apiPublicSettings
  /** Decode the server-provided recharge URL. */
  decodeRechargeUrl(payload: unknown): string | undefined
}

/** Runtime cache and security settings; no protocol defaults are hidden here. */
export interface Sub2apiRuntimeOptions {
  readonly profile: Sub2apiProtocolProfile
  readonly deploymentFingerprint: Sub2apiDeploymentFingerprint
  readonly http: Sub2apiHttpClient
  readonly credentials: Sub2apiCredentialStore
  readonly managedKeyName: string
  /** Sub2API group that receives the managed key and routes its gateway traffic. */
  readonly managedKeyGroupId: number
  readonly cacheTtlMs: {
    readonly account: number
    readonly models: number
    readonly groups: number
    readonly usage: number
    readonly publicSettings: number
  }
  readonly refreshSkewMs: number
  /** Permit the credential store to retain and refresh a deployment-issued session token. */
  readonly persistRefreshToken: boolean
  /** Exact origins approved for opening a recharge page. */
  readonly rechargeAllowedOrigins?: readonly string[]
  readonly codec?: Sub2apiProtocolCodec
  readonly now?: () => number
  /** Optional persistent model-capacity settings supplied by the settings seam. */
  readonly modelSettings?: Sub2apiModelSettingsStore
}

/** Host-only account runtime that owns tokens, records, caches, and protocol calls. */
export interface Sub2apiRuntime {
  /** Read the current secret-free state synchronously. */
  state(): Sub2apiStateView
  /** Read the normalized, secret-free deployment profile. */
  profile(): Sub2apiProtocolProfile
  /** Subscribe to detached state projections. */
  subscribe(listener: (state: Sub2apiStateView) => void): () => void
  /** Load and validate the persisted grant, refreshing an eligible session before an operation. */
  hydrate(): Promise<void>
  /** Register a new Sub2API account. */
  register(input: Sub2apiRegisterInput, signal?: AbortSignal): Promise<void>
  /** Authenticate an existing Sub2API account. */
  login(input: Sub2apiLoginInput, signal?: AbortSignal): Promise<void>
  /** Complete an in-progress second-factor challenge. */
  submit2FA(input: Sub2apiTwoFactorInput, signal?: AbortSignal): Promise<void>
  /** Clear local account state; the server-side managed Key is retained. */
  logout(): Promise<void>
  /** Refresh and return the current account summary. */
  refreshAccount(signal?: AbortSignal): Promise<Sub2apiAccountSnapshot>
  /** Refresh and return models visible to the managed API Key. */
  refreshModels(signal?: AbortSignal): Promise<readonly Sub2apiModelDescriptor[]>
  /** Persist and apply a model's context-window override. */
  updateModelSettings(input: Sub2apiModelSettingsInput): Promise<void>
  /** Re-apply settings changed by another settings consumer. */
  refreshModelSettings(): void
  /** Update the authenticated user's managed API Key group. */
  updateManagedKeyGroup(groupId: number, signal?: AbortSignal): Promise<void>
  /** Refresh and return groups available to the authenticated account. */
  getAvailableGroups(signal?: AbortSignal): Promise<readonly Sub2apiGroupDescriptor[]>
  /** Refresh or return a bounded usage/balance snapshot. */
  getUsage(signal?: AbortSignal): Promise<Sub2apiUsageSnapshot>
  /** Read unauthenticated deployment capability settings. */
  getPublicSettings(signal?: AbortSignal): Promise<Sub2apiPublicSettings | undefined>
  /** Return a validated recharge URL from the configured account endpoint. */
  getRechargeUrl(signal?: AbortSignal): Promise<string | undefined>
  /** Return the Host-only API Key snapshot used by the model provider. */
  resolveGatewayCredential(signal?: AbortSignal): Promise<Sub2apiGatewayCredential>
  /** Return a fetch guarded by the deployment destination policy. */
  createValidatedFetch(): typeof globalThis.fetch
}

/**
 * Create the strict standard field mapping used by verified Sub2API fixtures.
 * @returns the standard protocol codec.
 */
export function createStandardSub2apiCodec(): Sub2apiProtocolCodec {
  return {
    encodeRegister: input => ({
      email: input.email,
      password: input.password,
      ...(input.verificationCode === undefined ? {} : { verify_code: input.verificationCode }),
    }),
    encodeLogin: input => ({ email: input.email, password: input.password }),
    encodeTwoFactor: (input, challenge) => ({
      totp_code: input.code,
      ...(challenge === undefined ? {} : { temp_token: challenge }),
    }),
    encodeRefresh: refreshToken => ({ refresh_token: refreshToken }),
    decodeAuthentication: decodeAuthentication,
    decodeAccount: decodeAccount,
    decodeApiKeys: decodeApiKeys,
    decodeGroups: decodeGroups,
    decodeApiKey: decodeApiKey,
    decodeCreatedApiKey: decodeCreatedApiKey,
    decodeModels: decodeModels,
    decodeUsage: decodeUsage,
    decodePublicSettings: decodePublicSettings,
    decodeRechargeUrl: decodeRechargeUrl,
  }
}

/** Concrete runtime implementation used by Host composition and protocol fixtures. */
export class Sub2apiRuntimeService implements Sub2apiRuntime {
  private readonly codec: Sub2apiProtocolCodec
  private readonly now: () => number
  private readonly guard = new Sub2apiGenerationGuard()
  private snapshot: Sub2apiStateView
  private record: ReturnType<typeof parseSub2apiGrantRecord> | undefined
  private accessToken: string | undefined
  private accessTokenExpiresAt: number | undefined
  private pendingTwoFactor: { readonly generation: number; readonly challenge?: string } | undefined
  private hydrated = false
  private hydrateFlight: Promise<void> | undefined
  private refreshFlight: Promise<void> | undefined
  private keyFlight: Promise<Sub2apiApiKeyDescriptor> | undefined
  private accountFlight: Promise<Sub2apiAccountSnapshot> | undefined
  private modelsFlight: Promise<readonly Sub2apiModelDescriptor[]> | undefined
  private groupsFlight: Promise<readonly Sub2apiGroupDescriptor[]> | undefined
  private usageFlight: Promise<Sub2apiUsageSnapshot> | undefined
  private publicSettingsFlight: Promise<Sub2apiPublicSettings | undefined> | undefined
  private accountCache: { readonly value: Sub2apiAccountSnapshot; readonly expiresAt: number } | undefined
  private modelsCache: { readonly value: readonly Sub2apiModelDescriptor[]; readonly expiresAt: number } | undefined
  private groupsCache: { readonly value: readonly Sub2apiGroupDescriptor[]; readonly expiresAt: number } | undefined
  private usageCache: { readonly value: Sub2apiUsageSnapshot; readonly expiresAt: number } | undefined
  private publicSettingsCache: { readonly value: Sub2apiPublicSettings; readonly expiresAt: number } | undefined
  private readonly listeners = new Set<(state: Sub2apiStateView) => void>()

  /**
   * Create a Host runtime.
   * @param options - verified profile, transport, credential store, and explicit policies.
   */
  constructor(private readonly options: Sub2apiRuntimeOptions) {
    this.codec = options.codec ?? createStandardSub2apiCodec()
    this.now = options.now ?? Date.now
    validateRuntimeOptions(options)
    this.snapshot = createSub2apiSnapshot(this.now())
  }

  state(): Sub2apiStateView {
    return {
      ...this.snapshot,
      ...(this.snapshot.account === undefined ? {} : { account: { ...this.snapshot.account } }),
      ...(this.snapshot.error === undefined ? {} : { error: { ...this.snapshot.error } }),
      ...(this.snapshot.models === undefined ? {} : { models: [...this.snapshot.models] }),
      ...(this.snapshot.usage === undefined ? {} : { usage: { ...this.snapshot.usage } }),
      ...(this.recordMatchesDeployment() && this.record !== undefined
        ? { apiKey: apiKeyView(this.record.apiKey) }
        : {}),
    }
  }

  profile(): Sub2apiProtocolProfile {
    return this.options.profile
  }

  subscribe(listener: (state: Sub2apiStateView) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return
    const previous = this.hydrateFlight
    if (previous !== undefined) return previous
    const flight = (async () => {
      await this.loadRecord()
      if (!this.shouldRestorePersistedSession()) return
      try {
        await this.refreshInternal(undefined, this.guard.current)
        await this.refreshModels()
      } catch (error: unknown) {
        if (!(error instanceof Sub2apiError)) throw error
      }
    })()
    this.hydrateFlight = flight
    try {
      await flight
    } finally {
      if (this.hydrateFlight === flight) this.hydrateFlight = undefined
      this.notifyState()
    }
  }

  register(input: Sub2apiRegisterInput, signal?: AbortSignal): Promise<void> {
    return this.observe(this.authenticate('register', input, signal))
  }

  login(input: Sub2apiLoginInput, signal?: AbortSignal): Promise<void> {
    return this.observe(this.authenticate('login', input, signal))
  }

  async submit2FA(input: Sub2apiTwoFactorInput, signal?: AbortSignal): Promise<void> {
    return this.observe((async () => {
      await this.hydrate()
      if (this.snapshot.status !== 'two-factor-required' || this.pendingTwoFactor === undefined) {
        throw new Sub2apiError('SUB2API_2FA_REQUIRED', 'Sub2API has no pending second-factor challenge')
      }
      const path = this.options.profile.account.paths.loginTwoFactor
      if (path === undefined) {
        this.transition({ type: 'reauth-required', at: this.now() })
        throw new Sub2apiError('SUB2API_2FA_UNSUPPORTED', 'This Sub2API deployment requires unsupported second-factor authentication')
      }
      requireNonEmpty(input.code, 'two-factor code')
      const generation = this.guard.capture()
      try {
        const response = await this.options.http.request({
          base: 'account',
          path,
          method: 'POST',
          body: this.codec.encodeTwoFactor(input, this.pendingTwoFactor.challenge),
        }, signal)
        const result = this.codec.decodeAuthentication(parseSub2apiPayload(
          response.body,
          this.options.profile.account.responseEnvelope,
        ))
        if (result.twoFactorRequired === true) {
          throw new Sub2apiError('SUB2API_2FA_REQUIRED', 'Sub2API requested another second-factor step')
        }
        await this.finishAuthentication(result, generation, signal)
      } catch (error: unknown) {
        this.handleFailure(error, generation)
        throw error
      }
    })())
  }

  async logout(): Promise<void> {
    await this.observe((async () => {
      await this.hydrate()
      if (this.snapshot.status === 'signing-out') return
      const at = this.now()
      const shouldFinalizeState = this.snapshot.status !== 'signed-out'
      if (shouldFinalizeState) this.transition({ type: 'begin-sign-out', at })
      else this.guard.advance()
      this.accessToken = undefined
      this.accessTokenExpiresAt = undefined
      this.pendingTwoFactor = undefined
      this.record = undefined
      this.accountCache = undefined
      this.modelsCache = undefined
      this.groupsCache = undefined
      this.usageCache = undefined
      await this.options.credentials.deleteRecord(SUB2API_RECORD_KEY)
      if (shouldFinalizeState) this.transition({ type: 'signed-out', at: this.now() })
      else this.snapshot = { status: 'signed-out', generation: this.guard.current, updatedAt: this.now() }
      this.snapshot = { status: this.snapshot.status, generation: this.snapshot.generation, updatedAt: this.snapshot.updatedAt }
    })())
  }

  async refreshAccount(signal?: AbortSignal): Promise<Sub2apiAccountSnapshot> {
    await this.hydrate()
    if (this.accountCache !== undefined && this.accountCache.expiresAt > this.now()) return this.accountCache.value
    const previous = this.accountFlight
    if (previous !== undefined) return previous
    const flight = this.refreshAccountOnce(signal)
    this.accountFlight = flight
    try {
      return await this.observe(flight)
    } finally {
      if (this.accountFlight === flight) this.accountFlight = undefined
    }
  }

  async refreshModels(signal?: AbortSignal): Promise<readonly Sub2apiModelDescriptor[]> {
    await this.hydrate()
    if (this.modelsCache !== undefined && this.modelsCache.expiresAt > this.now()) return this.modelsCache.value
    const previous = this.modelsFlight
    if (previous !== undefined) return previous
    const flight = this.refreshModelsOnce(signal)
    this.modelsFlight = flight
    try {
      return await this.observe(flight)
    } finally {
      if (this.modelsFlight === flight) this.modelsFlight = undefined
    }
  }

  async updateModelSettings(input: Sub2apiModelSettingsInput): Promise<void> {
    validateModelSettingsInput(input)
    const store = this.options.modelSettings
    if (store === undefined) throw new Sub2apiError('SUB2API_SERVICE_UNAVAILABLE', 'Sub2API model settings are unavailable')
    await store.update(input.modelId, { contextWindow: input.contextWindow })
    this.modelsCache = undefined
    this.applyModelSettings()
    this.notifyState()
  }

  refreshModelSettings(): void {
    this.applyModelSettings()
    this.notifyState()
  }

  async updateManagedKeyGroup(groupId: number, signal?: AbortSignal): Promise<void> {
    return this.observe((async () => {
      validateManagedKeyGroupId(groupId)
      await this.hydrate()
      await this.resolveGatewayCredential(signal)
      const current = this.record
      if (!this.recordMatchesDeployment() || current?.apiKey.id === undefined) {
        throw new Sub2apiError('SUB2API_KEY_REQUIRED', 'Sub2API managed API Key has no server identifier')
      }
      if (current.apiKey.groupId === groupId) return
      const response = await this.accountRequest({
        base: 'account',
        path: `${this.options.profile.account.paths.apiKeys.replace(/\/$/u, '')}/${encodeURIComponent(current.apiKey.id)}`,
        method: 'PUT',
        body: { group_id: groupId },
      }, signal)
      const updated = this.codec.decodeApiKey(parseSub2apiPayload(
        response.body,
        this.options.profile.account.responseEnvelope,
      ))
      if (updated.id !== undefined && updated.id !== current.apiKey.id) {
        throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API returned a different managed API Key')
      }
      if (!updated.active || updated.groupId !== groupId) {
        throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API did not apply the requested managed API Key group')
      }
      const generation = this.guard.capture()
      await this.writeRecord({
        ...current,
        apiKey: {
          ...current.apiKey,
          groupId,
          ...(updated.fingerprint === undefined ? {} : { fingerprint: updated.fingerprint }),
          ...(updated.createdAt === undefined ? {} : { createdAt: updated.createdAt }),
        },
        updatedAt: this.now(),
      }, generation)
      this.modelsCache = undefined
      const { models: _models, ...withoutModels } = withoutError(this.snapshot)
      this.snapshot = { ...withoutModels, updatedAt: this.now() }
    })())
  }

  async getAvailableGroups(signal?: AbortSignal): Promise<readonly Sub2apiGroupDescriptor[]> {
    await this.hydrate()
    if (this.groupsCache !== undefined && this.groupsCache.expiresAt > this.now()) return this.groupsCache.value
    const previous = this.groupsFlight
    if (previous !== undefined) return previous
    const path = this.options.profile.account.paths.groupsAvailable
    if (path === undefined) throw new Sub2apiError('SUB2API_ACCOUNT_UNAVAILABLE', 'This Sub2API profile has no groups endpoint')
    const flight = this.refreshGroupsOnce(path, signal)
    this.groupsFlight = flight
    try {
      return await this.observe(flight)
    } finally {
      if (this.groupsFlight === flight) this.groupsFlight = undefined
    }
  }

  async getUsage(signal?: AbortSignal): Promise<Sub2apiUsageSnapshot> {
    await this.hydrate()
    if (this.usageCache !== undefined && this.usageCache.expiresAt > this.now()) return this.usageCache.value
    const previous = this.usageFlight
    if (previous !== undefined) return previous
    const flight = this.refreshUsageOnce(signal)
    this.usageFlight = flight
    try {
      return await this.observe(flight)
    } finally {
      if (this.usageFlight === flight) this.usageFlight = undefined
    }
  }

  async getPublicSettings(signal?: AbortSignal): Promise<Sub2apiPublicSettings | undefined> {
    await this.hydrate()
    const path = this.options.profile.account.paths.publicSettings
    if (path === undefined) return undefined
    if (this.publicSettingsCache !== undefined && this.publicSettingsCache.expiresAt > this.now()) {
      return this.publicSettingsCache.value
    }
    const previous = this.publicSettingsFlight
    if (previous !== undefined) return previous
    const flight = this.refreshPublicSettingsOnce(path, signal)
    this.publicSettingsFlight = flight
    try {
      return await flight
    } finally {
      if (this.publicSettingsFlight === flight) this.publicSettingsFlight = undefined
    }
  }

  async getRechargeUrl(signal?: AbortSignal): Promise<string | undefined> {
    await this.hydrate()
    const path = this.options.profile.account.paths.recharge
    if (path === undefined) {
      const settings = await this.getPublicSettings(signal)
      if (settings === undefined) throw new Sub2apiError('SUB2API_RECHARGE_UNAVAILABLE', 'This Sub2API profile has no recharge endpoint')
      const billingEnabled = settings.paymentEnabled === true || settings.subscriptionEnabled === true
      if (!billingEnabled || settings.paymentBalanceDisabled === true) return undefined
      const value = settings.rechargeUrl
      if (value === undefined) return undefined
      return validateRechargeUrl(value, this.options)
    }
    const response = await this.accountRequest({
      base: 'account',
      path,
      method: 'GET',
    }, signal)
    const payload = parseSub2apiPayload(response.body, this.options.profile.account.responseEnvelope)
    const value = this.codec.decodeRechargeUrl(payload)
    if (value === undefined) return undefined
    return validateRechargeUrl(value, this.options)
  }

  async resolveGatewayCredential(signal?: AbortSignal): Promise<Sub2apiGatewayCredential> {
    await this.hydrate()
    await this.ensureAccessToken(signal)
    if (!this.recordMatchesDeployment()) {
      await this.refreshAccount(signal)
    }
    const generation = this.guard.capture()
    const existing = this.record
    if (existing !== undefined
      && this.recordMatchesDeployment()
      && existing.apiKey.groupId === this.expectedManagedKeyGroupId()) {
      return {
        deploymentFingerprint: this.options.deploymentFingerprint,
        generation,
        apiKey: existing.apiKey.secret,
      }
    }
    const account = this.snapshot.account
    if (account === undefined) throw new Sub2apiError('SUB2API_ACCOUNT_UNAVAILABLE', 'Sub2API account information is unavailable')
    const key = await this.reconcileManagedKey(account, this.accessToken as string, generation, false, signal)
    return {
      deploymentFingerprint: this.options.deploymentFingerprint,
      generation: this.guard.current,
      apiKey: key.secret as NonNullable<Sub2apiApiKeyDescriptor['secret']>,
    }
  }

  createValidatedFetch(): typeof globalThis.fetch {
    return this.options.http.createValidatedFetch()
  }

  private async observe<T>(promise: Promise<T>): Promise<T> {
    try {
      return await promise
    } finally {
      this.notifyState()
    }
  }

  private notifyState(): void {
    if (this.listeners.size === 0) return
    const state = this.state()
    for (const listener of [...this.listeners]) {
      try {
        listener(state)
      } catch {
        // A UI observer cannot veto an account transition or make a request
        // fail after its durable state has already been committed.
      }
    }
  }

  private async authenticate(
    operation: 'login' | 'register',
    input: Sub2apiLoginInput | Sub2apiRegisterInput,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    await this.hydrate()
    if (!['signed-out', 'reauth-required', 'key-required', 'insufficient-balance'].includes(this.snapshot.status)) {
      throw new Sub2apiError('SUB2API_BAD_REQUEST', `Sub2API cannot start ${operation} while ${this.snapshot.status}`)
    }
    requireNonEmpty(input.email, 'email')
    requireNonEmpty(input.password, 'password')
    this.transition({ type: 'begin-authentication', at: this.now() })
    this.pendingTwoFactor = undefined
    const generation = this.guard.capture()
    const path = operation === 'login'
      ? this.options.profile.account.paths.login
      : this.options.profile.account.paths.register
    const body = operation === 'login'
      ? this.codec.encodeLogin(input as Sub2apiLoginInput)
      : this.codec.encodeRegister(input as Sub2apiRegisterInput)
    try {
      const response = await this.options.http.request({
        base: 'account',
        path,
        method: 'POST',
        body,
      }, signal)
      const result = this.codec.decodeAuthentication(parseSub2apiPayload(
        response.body,
        this.options.profile.account.responseEnvelope,
      ))
      if (result.twoFactorRequired === true) {
        if (this.options.profile.account.paths.loginTwoFactor === undefined) {
          this.transition({ type: 'reauth-required', at: this.now() })
          throw new Sub2apiError('SUB2API_2FA_UNSUPPORTED', 'This Sub2API deployment requires unsupported second-factor authentication')
        }
        this.pendingTwoFactor = { generation, ...(result.challenge === undefined ? {} : { challenge: result.challenge }) }
        this.transition({ type: 'two-factor-required', at: this.now() })
        return
      }
      await this.finishAuthentication(result, generation, signal)
    } catch (error: unknown) {
      this.handleFailure(error, generation)
      throw error
    }
  }

  private async finishAuthentication(
    result: Exclude<Sub2apiAuthenticationResult, { readonly twoFactorRequired: true }>,
    generation: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    this.assertCurrent(generation)
    this.accessToken = result.accessToken
    this.accessTokenExpiresAt = result.expiresAt
      ?? (result.expiresIn === undefined ? undefined : this.now() + result.expiresIn * 1_000)
    this.pendingTwoFactor = undefined
    const accountResponse = await this.options.http.request({
      base: 'account',
      path: this.options.profile.account.paths.me,
      method: 'GET',
      credential: { kind: 'access-token', value: this.accessToken },
    }, signal)
    this.assertCurrent(generation)
    const account = this.codec.decodeAccount(parseSub2apiPayload(
      accountResponse.body,
      this.options.profile.account.responseEnvelope,
    ))
    this.transition({ type: 'authenticated', account, at: this.now() })
    const authenticatedGeneration = this.guard.current
    try {
      await this.reconcileManagedKey(account, this.accessToken, authenticatedGeneration, false, signal, result)
      this.accountCache = {
        value: { account, asOf: this.now(), stale: false },
        expiresAt: this.now() + this.options.cacheTtlMs.account,
      }
    } catch (error: unknown) {
      if (error instanceof Sub2apiError && error.code === 'SUB2API_KEY_REQUIRED') {
        this.markFailure(error)
      }
      throw error
    }
  }

  private async refreshAccountOnce(signal: AbortSignal | undefined): Promise<Sub2apiAccountSnapshot> {
    const previous = this.accountCache
    try {
      const response = await this.accountRequest({
        base: 'account',
        path: this.options.profile.account.paths.me,
        method: 'GET',
      }, signal)
      const generation = this.guard.capture()
      const account = this.codec.decodeAccount(parseSub2apiPayload(
        response.body,
        this.options.profile.account.responseEnvelope,
      ))
      this.assertCurrent(generation)
      const value = { account, asOf: this.now(), stale: false }
      this.accountCache = { value, expiresAt: this.now() + this.options.cacheTtlMs.account }
      this.snapshot = { ...withoutError(this.snapshot), account, updatedAt: value.asOf }
      await this.updateRecordAccount(account, generation)
      return value
    } catch (error: unknown) {
      this.markFailure(error)
      if (error instanceof Sub2apiError && error.code === 'SUB2API_CANCELLED') throw error
      if (previous !== undefined) return { ...previous.value, stale: true }
      throw error
    }
  }

  private async refreshModelsOnce(signal: AbortSignal | undefined): Promise<readonly Sub2apiModelDescriptor[]> {
    try {
      const response = await this.gatewayRequest({
        base: 'gateway',
        path: this.options.profile.gateway.paths.models,
        method: 'GET',
      }, signal)
      const generation = this.guard.capture()
      const models = this.codec.decodeModels(parseSub2apiPayload(
        response.body,
        this.options.profile.gateway.responseEnvelope,
      ))
      const configuredModels = applyModelSettings(models, this.options.modelSettings?.get())
      this.assertCurrent(generation)
      this.modelsCache = { value: [...configuredModels], expiresAt: this.now() + this.options.cacheTtlMs.models }
      this.snapshot = { ...withoutError(this.snapshot), models: [...configuredModels], updatedAt: this.now() }
      return configuredModels
    } catch (error: unknown) {
      this.markFailure(error)
      throw error
    }
  }

  private async refreshUsageOnce(signal: AbortSignal | undefined): Promise<Sub2apiUsageSnapshot> {
    const path = this.options.profile.account.paths.usage
    if (path === undefined) throw new Sub2apiError('SUB2API_ACCOUNT_UNAVAILABLE', 'This Sub2API profile has no usage endpoint')
    const previous = this.usageCache
    try {
      const response = await this.accountRequest({ base: 'account', path, method: 'GET' }, signal)
      const generation = this.guard.capture()
      const usage = this.codec.decodeUsage(parseSub2apiPayload(
        response.body,
        this.options.profile.account.responseEnvelope,
      ), this.now())
      this.assertCurrent(generation)
      const value = { ...usage, stale: false }
      this.usageCache = { value, expiresAt: this.now() + this.options.cacheTtlMs.usage }
      this.snapshot = { ...withoutError(this.snapshot), usage: value, updatedAt: value.asOf }
      return value
    } catch (error: unknown) {
      this.markFailure(error)
      if (error instanceof Sub2apiError && error.code === 'SUB2API_CANCELLED') throw error
      if (previous !== undefined) return { ...previous.value, stale: true }
      throw error
    }
  }

  private async refreshGroupsOnce(path: string, signal: AbortSignal | undefined): Promise<readonly Sub2apiGroupDescriptor[]> {
    try {
      const response = await this.accountRequest({ base: 'account', path, method: 'GET' }, signal)
      const generation = this.guard.capture()
      const groups = this.codec.decodeGroups(parseSub2apiPayload(
        response.body,
        this.options.profile.account.responseEnvelope,
      ))
      this.assertCurrent(generation)
      const value = [...groups]
      this.groupsCache = { value, expiresAt: this.now() + this.options.cacheTtlMs.groups }
      return value
    } catch (error: unknown) {
      this.markFailure(error)
      throw error
    }
  }

  private async refreshPublicSettingsOnce(path: string, signal: AbortSignal | undefined): Promise<Sub2apiPublicSettings> {
    const response = await this.options.http.request({
      base: 'account',
      path,
      method: 'GET',
    }, signal)
    const settings = this.codec.decodePublicSettings(parseSub2apiPayload(
      response.body,
      this.options.profile.account.responseEnvelope,
    ))
    this.publicSettingsCache = {
      value: settings,
      expiresAt: this.now() + this.options.cacheTtlMs.publicSettings,
    }
    return settings
  }

  /** Apply persisted model settings to the already-discovered catalog. */
  private applyModelSettings(): void {
    if (this.snapshot.models === undefined) return
    const models = applyModelSettings(this.snapshot.models, this.options.modelSettings?.get())
    this.modelsCache = { value: [...models], expiresAt: this.now() + this.options.cacheTtlMs.models }
    this.snapshot = { ...withoutError(this.snapshot), models: [...models], updatedAt: this.now() }
  }

  private async accountRequest(
    request: Parameters<Sub2apiHttpClient['request']>[0],
    signal: AbortSignal | undefined,
  ) {
    await this.ensureAccessToken(signal)
    const generation = this.guard.capture()
    const firstToken = this.accessToken
    if (firstToken === undefined) throw new Sub2apiError('SUB2API_NOT_AUTHENTICATED', 'Sub2API sign-in is required')
    try {
      const response = await this.options.http.request({ ...request, credential: { kind: 'access-token', value: firstToken } }, signal)
      this.assertCurrent(generation)
      return response
    } catch (error: unknown) {
      if (!(error instanceof Sub2apiError) || error.code !== 'SUB2API_REAUTH_REQUIRED') {
        this.handleFailure(error, generation)
        throw error
      }
      this.accessToken = undefined
      if (this.record?.auth.refreshToken === undefined || this.options.profile.account.paths.refresh === undefined) {
        this.markFailure(error)
        throw error
      }
      await this.refreshInternal(signal, generation)
      this.assertCurrent(generation)
      const replayToken = this.requireAccessToken()
      try {
        const response = await this.options.http.request({ ...request, credential: { kind: 'access-token', value: replayToken } }, signal)
        this.assertCurrent(generation)
        return response
      } catch (replayed: unknown) {
        this.accessToken = undefined
        this.markFailure(replayed)
        throw replayed
      }
    }
  }

  private async gatewayRequest(
    request: Parameters<Sub2apiHttpClient['request']>[0],
    signal: AbortSignal | undefined,
  ) {
    let recovered = false
    for (;;) {
      const credential = await this.resolveGatewayCredential(signal)
      try {
        const response = await this.options.http.request({
          ...request,
          credential: { kind: 'api-key', value: credential.apiKey },
        }, signal)
        if (credential.generation !== this.guard.current) throw supersededError()
        return response
      } catch (error: unknown) {
        if (!(error instanceof Sub2apiError) || error.code !== 'SUB2API_KEY_INVALID' || recovered) {
          this.markFailure(error)
          throw error
        }
        recovered = true
        this.markFailure(error)
        await this.reconcileCurrentKey(true, signal)
      }
    }
  }

  private async ensureAccessToken(signal: AbortSignal | undefined): Promise<string> {
    if (this.accessToken !== undefined && !this.isAccessTokenExpiring()) return this.accessToken
    if (this.record?.auth.refreshToken !== undefined && this.options.profile.account.paths.refresh !== undefined) {
      await this.refreshInternal(signal, this.guard.capture())
      if (this.accessToken !== undefined) return this.accessToken
    }
    const code = this.record === undefined ? 'SUB2API_NOT_AUTHENTICATED' : 'SUB2API_REAUTH_REQUIRED'
    throw new Sub2apiError(code, code === 'SUB2API_NOT_AUTHENTICATED' ? 'Sub2API sign-in is required' : 'Sub2API sign-in has expired')
  }

  private isAccessTokenExpiring(): boolean {
    return this.accessTokenExpiresAt !== undefined && this.accessTokenExpiresAt <= this.now() + this.options.refreshSkewMs
  }

  private async refreshInternal(signal: AbortSignal | undefined, expectedGeneration: number): Promise<void> {
    const previous = this.refreshFlight
    if (previous !== undefined) return previous
    const flight = this.performRefresh(signal, expectedGeneration)
    this.refreshFlight = flight
    try {
      await flight
    } finally {
      if (this.refreshFlight === flight) this.refreshFlight = undefined
    }
  }

  private async performRefresh(signal: AbortSignal | undefined, expectedGeneration: number): Promise<void> {
    await this.hydrate()
    const record = this.record
    const path = this.options.profile.account.paths.refresh
    if (!this.recordMatchesDeployment() || record?.auth.refreshToken === undefined || path === undefined) {
      throw new Sub2apiError('SUB2API_REAUTH_REQUIRED', 'Sub2API refresh is unavailable; sign-in is required')
    }
    this.assertCurrent(expectedGeneration)
    if (this.snapshot.status !== 'refreshing') {
      this.transition({ type: 'begin-refresh', at: this.now() })
    }
    const generation = this.guard.capture()
    try {
      const response = await this.options.http.request({
        base: 'account',
        path,
        method: 'POST',
        body: this.codec.encodeRefresh(record.auth.refreshToken),
      }, signal)
      const result = this.codec.decodeAuthentication(parseSub2apiPayload(
        response.body,
        this.options.profile.account.responseEnvelope,
      ))
      if (result.twoFactorRequired === true) throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API refresh unexpectedly requested second-factor authentication')
      this.assertCurrent(generation)
      this.accessToken = result.accessToken
      this.accessTokenExpiresAt = result.expiresAt
        ?? (result.expiresIn === undefined ? undefined : this.now() + result.expiresIn * 1_000)
      if (this.options.persistRefreshToken) {
        await this.options.credentials.modifyRecord(SUB2API_RECORD_KEY, (current) => {
          this.assertCurrent(generation)
          if (current?.kind !== 'grant') throw new Sub2apiError('SUB2API_REAUTH_REQUIRED', 'Sub2API grant disappeared during refresh')
          const currentRecord = parseSub2apiGrantRecord(current.payload, this.options.profile.allowInsecureHttpOrigins)
          const nextRefreshToken = result.refreshToken ?? currentRecord.auth.refreshToken
          const next = {
            ...currentRecord,
            auth: {
              ...(nextRefreshToken === undefined ? {} : { refreshToken: nextRefreshToken }),
              ...(result.refreshTokenType ?? currentRecord.auth.refreshTokenType) === undefined
                ? {}
                : { refreshTokenType: result.refreshTokenType ?? currentRecord.auth.refreshTokenType },
              lastRefreshAt: this.now(),
            },
            updatedAt: this.now(),
          }
          this.record = next
          return Promise.resolve({ kind: 'grant', payload: next })
        })
      }
      const account = this.snapshot.account ?? record.account
      if (this.snapshot.status === 'refreshing') this.transition({ type: 'refresh-succeeded', account, at: this.now() })
    } catch (error: unknown) {
      this.accessToken = undefined
      if (error instanceof Sub2apiError && error.code === 'SUB2API_REAUTH_REQUIRED') {
        this.markFailure(error)
      } else {
        this.restoreAfterRefreshFailure(error)
      }
      throw error
    }
  }

  private async reconcileCurrentKey(forceCreate: boolean, signal: AbortSignal | undefined): Promise<Sub2apiApiKeyDescriptor> {
    const previous = this.keyFlight
    if (previous !== undefined) return previous
    const flight = (async () => {
      const account = this.snapshot.account ?? (await this.refreshAccount(signal)).account
      const token = await this.ensureAccessToken(signal)
      return this.reconcileManagedKey(account, token, this.guard.capture(), forceCreate, signal)
    })()
    this.keyFlight = flight
    try {
      return await flight
    } finally {
      if (this.keyFlight === flight) this.keyFlight = undefined
    }
  }

  private async reconcileManagedKey(
    account: Sub2apiAccountSummary,
    accessToken: string,
    generation: number,
    forceCreate: boolean,
    signal: AbortSignal | undefined,
    authentication?: Exclude<Sub2apiAuthenticationResult, { readonly twoFactorRequired: true }>,
  ): Promise<Sub2apiApiKeyDescriptor> {
    this.assertCurrent(generation)
    const listResponse = await this.options.http.request({
      base: 'account',
      path: this.options.profile.account.paths.apiKeys,
      method: 'GET',
      credential: { kind: 'access-token', value: accessToken },
    }, signal)
    this.assertCurrent(generation)
    const keys = this.codec.decodeApiKeys(parseSub2apiPayload(
      listResponse.body,
      this.options.profile.account.responseEnvelope,
    ))
    const currentRecord = this.record
    let candidate: Sub2apiApiKeyDescriptor | undefined
    if (!forceCreate && currentRecord?.account.userId === account.userId && currentRecord.apiKey.id !== undefined) {
      candidate = keys.find(key => key.id === currentRecord.apiKey.id && key.active && key.groupId === this.expectedManagedKeyGroupId())
    }
    if (!forceCreate && candidate === undefined) {
      const matches = keys.filter(key => key.name === this.options.managedKeyName
        && key.active && key.groupId === this.expectedManagedKeyGroupId())
      if (matches.length > 1) {
        throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API returned multiple active managed API Keys')
      }
      candidate = matches[0]
    }
    const priorSecret = this.recordMatchesDeployment()
      && currentRecord?.account.userId === account.userId
      && currentRecord.apiKey.name === this.options.managedKeyName
      ? currentRecord.apiKey.secret
      : undefined
    const reusableRecord = this.recordMatchesDeployment() && currentRecord?.account.userId === account.userId
    const usableExisting = candidate !== undefined && priorSecret !== undefined
      ? { ...candidate, secret: priorSecret }
      : undefined
    const selected = usableExisting ?? await this.createManagedKey(accessToken, generation, signal)
    const expectedGroupId = this.expectedManagedKeyGroupId()
    const selectedGroupId = selected.groupId === undefined ? expectedGroupId : selected.groupId
    if (selectedGroupId !== expectedGroupId) {
      throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API returned a managed API Key for the wrong group')
    }
    const nextGeneration = this.snapshot.status === 'key-required' ? this.snapshot.generation + 1 : this.snapshot.generation
    const nextRecord = {
      version: 1 as const,
      deployment: {
        origin: new URL(this.options.profile.accountBaseUrl).origin,
        fingerprint: this.options.deploymentFingerprint,
      },
      account,
      auth: this.options.persistRefreshToken && reusableRecord && currentRecord.auth.refreshToken !== undefined
        ? {
          refreshToken: authentication?.refreshToken ?? currentRecord.auth.refreshToken,
          ...(authentication?.refreshTokenType ?? currentRecord.auth.refreshTokenType) === undefined
            ? {}
            : { refreshTokenType: authentication?.refreshTokenType ?? currentRecord.auth.refreshTokenType },
        }
        : this.options.persistRefreshToken && authentication?.refreshToken !== undefined
          ? {
            refreshToken: authentication.refreshToken,
            ...(authentication.refreshTokenType === undefined ? {} : { refreshTokenType: authentication.refreshTokenType }),
          }
          : {},
      apiKey: {
        ...(selected.id === undefined ? {} : { id: selected.id }),
        name: this.options.managedKeyName,
        groupId: selectedGroupId,
        secret: selected.secret as NonNullable<Sub2apiApiKeyDescriptor['secret']>,
        ...(selected.fingerprint === undefined ? {} : { fingerprint: selected.fingerprint }),
        ...(selected.createdAt === undefined ? {} : { createdAt: selected.createdAt }),
      },
      generation: nextGeneration,
      updatedAt: this.now(),
    }
    await this.writeRecord(nextRecord, generation)
    if (this.snapshot.status === 'key-required') {
      this.transition({ type: 'credential-replaced', at: this.now() })
    }
    return selected
  }

  private async createManagedKey(
    accessToken: string,
    generation: number,
    signal: AbortSignal | undefined,
  ): Promise<Sub2apiApiKeyDescriptor> {
    const response = await this.options.http.request({
      base: 'account',
      path: this.options.profile.account.paths.apiKeys,
      method: 'POST',
      body: {
        name: this.options.managedKeyName,
        group_id: this.expectedManagedKeyGroupId(),
      },
      credential: { kind: 'access-token', value: accessToken },
    }, signal)
    this.assertCurrent(generation)
    const key = this.codec.decodeCreatedApiKey(parseSub2apiPayload(
      response.body,
      this.options.profile.account.responseEnvelope,
    ))
    if (key.secret === undefined) throw new Sub2apiError('SUB2API_KEY_REQUIRED', 'Sub2API did not return the managed API Key secret')
    if (!key.active) throw new Sub2apiError('SUB2API_KEY_REQUIRED', 'Sub2API returned an inactive managed API Key')
    return key
  }

  private async writeRecord(
    record: ReturnType<typeof parseSub2apiGrantRecord>,
    generation: number,
  ): Promise<void> {
    this.assertCurrent(generation)
    const stored = await this.options.credentials.modifyRecord(SUB2API_RECORD_KEY, () => {
      this.assertCurrent(generation)
      return Promise.resolve({ kind: 'grant', payload: record })
    })
    if (stored?.kind !== 'grant') throw new Sub2apiError('SUB2API_KEY_REQUIRED', 'Sub2API grant could not be persisted')
    this.record = parseSub2apiGrantRecord(stored.payload, this.options.profile.allowInsecureHttpOrigins)
  }

  private async updateRecordAccount(account: Sub2apiAccountSummary, generation: number): Promise<void> {
    if (this.record === undefined) return
    await this.options.credentials.modifyRecord(SUB2API_RECORD_KEY, (current) => {
      this.assertCurrent(generation)
      if (current?.kind !== 'grant') return Promise.resolve(current)
      const currentRecord = parseSub2apiGrantRecord(current.payload, this.options.profile.allowInsecureHttpOrigins)
      const next = { ...currentRecord, account, updatedAt: this.now() }
      this.record = next
      return Promise.resolve({ kind: 'grant', payload: next })
    })
  }

  private async loadRecord(): Promise<void> {
    const stored = await this.options.credentials.readRecord(SUB2API_RECORD_KEY)
    if (stored === undefined) {
      this.hydrated = true
      return
    }
    if (stored.kind !== 'grant') throw new Sub2apiError('SUB2API_BAD_RESPONSE', 'Sub2API credential record has the wrong kind')
    const record = parseSub2apiGrantRecord(stored.payload, this.options.profile.allowInsecureHttpOrigins)
    this.record = record
    this.guard.restore(record.generation)
    const expectedOrigin = new URL(this.options.profile.accountBaseUrl).origin
    if (record.deployment.fingerprint !== this.options.deploymentFingerprint || record.deployment.origin !== expectedOrigin) {
      this.snapshot = {
        status: 'reauth-required',
        generation: record.generation,
        account: record.account,
        error: { code: 'SUB2API_REAUTH_REQUIRED', message: 'Sub2API deployment changed; sign-in is required again', retryable: false },
        updatedAt: this.now(),
      }
    } else {
      this.snapshot = {
        status: 'reauth-required',
        generation: record.generation,
        account: record.account,
        error: { code: 'SUB2API_REAUTH_REQUIRED', message: 'Sub2API sign-in must be refreshed', retryable: false },
        updatedAt: this.now(),
      }
    }
    this.hydrated = true
  }

  private shouldRestorePersistedSession(): boolean {
    return this.options.persistRefreshToken
      && this.recordMatchesDeployment()
      && this.record?.auth.refreshToken !== undefined
      && this.options.profile.account.paths.refresh !== undefined
  }

  private recordMatchesDeployment(): boolean {
    if (this.record === undefined) return false
    return this.record.deployment.fingerprint === this.options.deploymentFingerprint
      && this.record.deployment.origin === new URL(this.options.profile.accountBaseUrl).origin
  }

  private expectedManagedKeyGroupId(): number {
    const groupId = this.recordMatchesDeployment() ? this.record?.apiKey.groupId : undefined
    return groupId ?? this.options.managedKeyGroupId
  }

  private transition(event: Sub2apiStateEvent): void {
    const next = applySub2apiStateEvent(this.snapshot, event)
    this.snapshot = {
      ...next,
      ...(this.snapshot.usage === undefined ? {} : { usage: this.snapshot.usage }),
      ...(this.snapshot.models === undefined ? {} : { models: this.snapshot.models }),
    }
    this.guard.restore(next.generation)
  }

  private markFailure(error: unknown): void {
    if (!(error instanceof Sub2apiError)) return
    if (!this.hydrated) return
    if (this.snapshot.status === 'signed-out') return
    if (error.code === 'SUB2API_REAUTH_REQUIRED' && this.snapshot.status !== 'reauth-required') {
      this.accessToken = undefined
      if (['authenticated', 'refreshing', 'insufficient-balance', 'key-required'].includes(this.snapshot.status)) {
        this.transition({ type: 'reauth-required', at: this.now() })
        return
      }
    }
    if (error.code === 'SUB2API_KEY_INVALID' && this.snapshot.status === 'authenticated') {
      this.transition({ type: 'key-required', at: this.now() })
      return
    }
    if (error.code === 'SUB2API_INSUFFICIENT_BALANCE' && this.snapshot.status === 'authenticated') {
      this.transition({ type: 'insufficient-balance', at: this.now() })
      return
    }
    this.snapshot = { ...this.snapshot, error: error.toSummary(), updatedAt: this.now() }
  }

  private handleFailure(error: unknown, generation: number): void {
    if (!this.guard.isCurrent(generation)) return
    this.markFailure(error)
  }

  private restoreAfterRefreshFailure(error: unknown): void {
    if (this.snapshot.status === 'refreshing') {
      const status = error instanceof Sub2apiError && !error.retryable
        ? 'reauth-required'
        : this.snapshot.account === undefined ? 'reauth-required' : 'authenticated'
      this.snapshot = {
        ...this.snapshot,
        status,
        ...(error instanceof Sub2apiError ? { error: error.toSummary() } : {}),
        updatedAt: this.now(),
      }
    } else {
      this.markFailure(error)
    }
  }

  private assertCurrent(generation: number): void {
    if (!this.guard.isCurrent(generation)) throw supersededError()
  }

  private requireAccessToken(): string {
    const token = this.accessToken
    if (token === undefined) throw new Sub2apiError('SUB2API_REAUTH_REQUIRED', 'Sub2API refresh did not produce an access token')
    return token
  }
}

function decodeAuthentication(payload: unknown): Sub2apiAuthenticationResult {
  const value = requireRecord(payload, 'authentication response')
  if (readBoolean(value, 'requires_2fa') || readBoolean(value, 'requires2FA') || readBoolean(value, 'two_factor_required')) {
    const challenge = readOptionalString(value, 'temp_token')
      ?? readOptionalString(value, 'two_factor_token')
      ?? readOptionalString(value, 'challenge')
    return { twoFactorRequired: true, ...(challenge === undefined ? {} : { challenge }) }
  }
  const accessToken = readRequiredString(value, ['access_token', 'accessToken'], 'access token')
  const refreshToken = readOptionalString(value, 'refresh_token') ?? readOptionalString(value, 'refreshToken')
  const refreshTokenType = readOptionalString(value, 'token_type') ?? readOptionalString(value, 'tokenType')
  const expiresIn = readOptionalNumber(value, ['expires_in', 'expiresIn'])
  const expiresAt = readOptionalNumber(value, ['expires_at', 'expiresAt'])
  return {
    accessToken: sub2apiSecret(accessToken),
    ...(refreshToken === undefined ? {} : { refreshToken: sub2apiSecret(refreshToken) }),
    ...(refreshTokenType === undefined ? {} : { refreshTokenType }),
    ...(expiresIn === undefined ? {} : { expiresIn }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  }
}

function decodeAccount(payload: unknown): Sub2apiAccountSummary {
  const value = requireRecord(payload, 'account response')
  const userId = readRequiredIdentifier(value, ['user_id', 'userId', 'id'], 'account user id')
  const email = readOptionalString(value, 'email')
  const displayName = readOptionalString(value, 'display_name')
    ?? readOptionalString(value, 'displayName')
    ?? readOptionalStringOrEmpty(value, 'username')
  const balance = readOptionalNumber(value, ['balance'])
  return {
    userId,
    ...(email === undefined ? {} : { email }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(balance === undefined ? {} : { balance }),
  }
}

function decodeApiKeys(payload: unknown): readonly Sub2apiApiKeyDescriptor[] {
  const rows = arrayPayload(payload, ['keys', 'api_keys', 'apiKeys', 'items', 'data'])
  return rows.map((row, index) => decodeApiKeyRecord(requireRecord(row, `API Key row ${String(index)}`)))
}

function decodeGroups(payload: unknown): readonly Sub2apiGroupDescriptor[] {
  const rows = arrayPayload(payload, ['groups', 'items', 'data'])
  return rows.map((row, index) => {
    const value = requireRecord(row, `group row ${String(index)}`)
    const id = readRequiredPositiveInteger(value, ['id', 'group_id', 'groupId'], 'group id')
    const name = readRequiredString(value, ['name', 'title', 'display_name', 'displayName'], 'group name')
    const platform = readOptionalStringOrEmpty(value, 'platform')
    const status = readOptionalStringOrEmpty(value, 'status')
    return {
      id,
      name,
      ...(platform === undefined ? {} : { platform }),
      ...(status === undefined ? {} : { status }),
    }
  })
}

function decodeApiKey(payload: unknown): Sub2apiApiKeyDescriptor {
  return decodeApiKeyRecord(requireRecord(payload, 'updated API Key response'))
}

function decodeApiKeyRecord(value: Record<string, unknown>): Sub2apiApiKeyDescriptor {
  const name = readRequiredString(value, ['name'], 'API Key name')
  const id = readOptionalIdentifier(value, 'id')
  const active = readActive(value)
  const createdAt = readOptionalTimestamp(value, ['created_at', 'createdAt'])
  const fingerprint = readOptionalString(value, 'fingerprint')
  const groupId = readOptionalGroupId(value)
  return {
    name,
    active,
    ...(id === undefined ? {} : { id }),
    ...(groupId === undefined ? {} : { groupId }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(fingerprint === undefined ? {} : { fingerprint }),
  }
}

function decodeCreatedApiKey(payload: unknown): Sub2apiApiKeyDescriptor {
  const value = requireRecord(payload, 'created API Key response')
  const name = readRequiredString(value, ['name'], 'API Key name')
  const secret = readOptionalString(value, 'key')
    ?? readOptionalString(value, 'secret')
    ?? readOptionalString(value, 'api_key')
    ?? readOptionalString(value, 'apiKey')
  if (secret === undefined) throw new Sub2apiError('SUB2API_KEY_REQUIRED', 'Sub2API create-key response omitted the secret')
  const id = readOptionalIdentifier(value, 'id')
  const groupId = readOptionalGroupId(value)
  const createdAt = readOptionalTimestamp(value, ['created_at', 'createdAt'])
  return {
    name,
    active: readActive(value),
    secret: sub2apiSecret(secret),
    ...(id === undefined ? {} : { id }),
    ...(groupId === undefined ? {} : { groupId }),
    ...(createdAt === undefined ? {} : { createdAt }),
  }
}

function decodeModels(payload: unknown): readonly Sub2apiModelDescriptor[] {
  const rows = arrayPayload(payload, ['models', 'data'])
  return rows.map((row, index) => {
    const value = requireRecord(row, `model row ${String(index)}`)
    const id = readRequiredString(value, ['id', 'model'], 'model id')
    const displayName = readOptionalString(value, 'name') ?? readOptionalString(value, 'display_name')
    const endpointFamily = readEndpointFamily(value)
    const supportsStreaming = readCapability(value, ['supports_streaming', 'supportsStreaming', 'streaming'])
    const supportsTools = readCapability(value, ['supports_tools', 'supportsTools', 'tools'])
    const supportsVision = readCapability(value, ['supports_vision', 'supportsVision', 'vision'])
    const supportsReasoning = readCapability(value, ['supports_reasoning', 'supportsReasoning', 'reasoning'])
    const supportsResponses = readCapability(value, ['supports_responses', 'supportsResponses', 'responses'])
    const contextWindow = readOptionalNumber(value, ['context_window', 'contextWindow'])
    const maxOutputTokens = readOptionalNumber(value, ['max_output_tokens', 'maxOutputTokens', 'max_tokens', 'maxTokens'])
    const source = readModelSource(value)
    return {
      id,
      ...(displayName === undefined ? {} : { displayName }),
      endpointFamily,
      supportsStreaming,
      supportsTools,
      supportsVision,
      supportsReasoning,
      supportsResponses,
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      source,
    }
  })
}

function readEndpointFamily(value: Record<string, unknown>): Sub2apiModelDescriptor['endpointFamily'] {
  const raw = value.endpoint_family ?? value.endpointFamily ?? value.endpoint
  if (raw === undefined) return 'unknown'
  if (raw === 'chat-completions' || raw === 'responses' || raw === 'unknown') return raw
  throw new Sub2apiError('SUB2API_BAD_RESPONSE', 'Sub2API model endpoint family is invalid')
}

function readCapability(
  value: Record<string, unknown>,
  keys: readonly string[],
): 'verified' | 'unsupported' | 'unknown' {
  for (const key of keys) {
    const raw = value[key]
    if (raw === undefined) continue
    if (raw === true) return 'verified'
    if (raw === false) return 'unsupported'
    if (raw === 'verified' || raw === 'unsupported' || raw === 'unknown') return raw
    throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API model capability ${key} is invalid`)
  }
  return 'unknown'
}

function readModelSource(value: Record<string, unknown>): Sub2apiModelDescriptor['source'] {
  const raw = value.source
  if (raw === undefined) return 'server-metadata'
  if (raw === 'fixture' || raw === 'server-metadata' || raw === 'configured' || raw === 'unknown') return raw
  throw new Sub2apiError('SUB2API_BAD_RESPONSE', 'Sub2API model source is invalid')
}

function decodeUsage(payload: unknown, at: number): Sub2apiUsageSnapshot {
  const value = requireRecord(payload, 'usage response')
  const balance = readOptionalNumber(value, ['balance', 'credits', 'remaining'])
  const used = readOptionalNumber(value, ['used', 'usage', 'total_actual_cost'])
  const limit = readOptionalNumber(value, ['limit', 'quota'])
  const currency = readOptionalString(value, 'currency')
  return {
    ...(balance === undefined ? {} : { balance }),
    ...(used === undefined ? {} : { used }),
    ...(limit === undefined ? {} : { limit }),
    ...(currency === undefined ? {} : { currency }),
    asOf: at,
    stale: false,
  }
}

function decodePublicSettings(payload: unknown): Sub2apiPublicSettings {
  const value = requireRecord(payload, 'public settings response')
  const registrationEnabled = readOptionalBoolean(value, ['registration_enabled', 'registrationEnabled'])
  const emailVerifyEnabled = readOptionalBoolean(value, ['email_verify_enabled', 'emailVerifyEnabled'])
  const totpEnabled = readOptionalBoolean(value, ['totp_enabled', 'totpEnabled'])
  const paymentEnabled = readOptionalBoolean(value, ['payment_enabled', 'paymentEnabled'])
  const subscriptionEnabled = readOptionalBoolean(value, ['subscription_enabled', 'subscriptionEnabled'])
  const paymentBalanceDisabled = readOptionalBoolean(value, ['payment_balance_disabled', 'paymentBalanceDisabled'])
  const rechargeUrl = readOptionalStringOrEmpty(value, 'purchase_subscription_url')
    ?? readOptionalStringOrEmpty(value, 'balance_low_notify_recharge_url')
    ?? readOptionalStringOrEmpty(value, 'recharge_url')
    ?? readOptionalStringOrEmpty(value, 'rechargeUrl')
  return {
    ...(registrationEnabled === undefined ? {} : { registrationEnabled }),
    ...(emailVerifyEnabled === undefined ? {} : { emailVerifyEnabled }),
    ...(totpEnabled === undefined ? {} : { totpEnabled }),
    ...(paymentEnabled === undefined ? {} : { paymentEnabled }),
    ...(subscriptionEnabled === undefined ? {} : { subscriptionEnabled }),
    ...(paymentBalanceDisabled === undefined ? {} : { paymentBalanceDisabled }),
    ...(rechargeUrl === undefined ? {} : { rechargeUrl }),
  }
}

function decodeRechargeUrl(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload
  if (!isRecord(payload)) return undefined
  return readOptionalString(payload, 'url') ?? readOptionalString(payload, 'recharge_url') ?? readOptionalString(payload, 'rechargeUrl')
}

function validateRuntimeOptions(options: Sub2apiRuntimeOptions): void {
  if (options.managedKeyName.trim() === '') throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API managedKeyName is required')
  validateManagedKeyGroupId(options.managedKeyGroupId)
  for (const [name, value] of Object.entries(options.cacheTtlMs)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Sub2apiError('SUB2API_BAD_REQUEST', `Sub2API cache TTL ${name} must be a positive integer`)
  }
  if (!Number.isSafeInteger(options.refreshSkewMs) || options.refreshSkewMs < 0) throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API refreshSkewMs must be a non-negative integer')
  if (options.rechargeAllowedOrigins !== undefined) {
    for (const origin of options.rechargeAllowedOrigins) normalizeSub2apiOrigin(origin, options.profile.allowInsecureHttpOrigins)
  }
}

function validateManagedKeyGroupId(groupId: number): void {
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API managed API Key group must be a positive integer')
  }
}

function validateModelSettingsInput(input: Sub2apiModelSettingsInput): void {
  if (input.modelId.trim() === '') throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API model id is required')
  if (!Number.isSafeInteger(input.contextWindow) || input.contextWindow <= 0) {
    throw new Sub2apiError('SUB2API_BAD_REQUEST', 'Sub2API model context window must be a positive integer')
  }
}

function applyModelSettings(
  models: readonly Sub2apiModelDescriptor[],
  overrides: Readonly<Record<string, Sub2apiModelOverride>> | undefined,
): readonly Sub2apiModelDescriptor[] {
  if (overrides === undefined) return models
  return models.map((model) => {
    const override = overrides[model.id]
    if (override?.contextWindow === undefined) return model
    return { ...model, contextWindow: override.contextWindow, source: 'configured' }
  })
}

function validateRechargeUrl(value: string, options: Sub2apiRuntimeOptions): string {
  let url: URL
  try {
    url = new URL(value, options.profile.accountBaseUrl)
  } catch (cause: unknown) {
    throw new Sub2apiError('SUB2API_RECHARGE_UNAVAILABLE', 'Sub2API recharge URL is invalid', { cause })
  }
  if (url.username !== '' || url.password !== '' || (url.protocol !== 'https:' && !options.profile.allowInsecureHttpOrigins.includes(url.origin))) {
    throw new Sub2apiError('SUB2API_RECHARGE_UNAVAILABLE', 'Sub2API recharge URL is not allowed')
  }
  const allowed = options.rechargeAllowedOrigins ?? []
  if (!allowed.includes(url.origin)) throw new Sub2apiError('SUB2API_RECHARGE_UNAVAILABLE', 'Sub2API recharge URL origin is not approved')
  return url.toString()
}

function arrayPayload(payload: unknown, keys: readonly string[]): readonly unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) throw new Sub2apiError('SUB2API_BAD_RESPONSE', 'Sub2API response did not contain an array')
  for (const key of keys) if (Array.isArray(payload[key])) return payload[key] as readonly unknown[]
  throw new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', 'Sub2API response did not contain the configured collection')
}

function withoutError(snapshot: Sub2apiStateView): Omit<Sub2apiStateView, 'error'> {
  const { error: _error, ...rest } = snapshot
  return rest
}

/** Remove the secret from durable managed-Key metadata before Remote projection. */
function apiKeyView(key: Sub2apiGrantRecordV1['apiKey']): Sub2apiApiKeyView {
  return {
    ...(key.id === undefined ? {} : { id: key.id }),
    name: key.name,
    active: true,
    ...(key.groupId === undefined ? {} : { groupId: key.groupId }),
    ...(key.createdAt === undefined ? {} : { createdAt: key.createdAt }),
    ...(key.fingerprint === undefined ? {} : { fingerprint: key.fingerprint }),
  }
}

function readActive(value: Record<string, unknown>): boolean {
  const explicit = value.active ?? value.is_active ?? value.isActive ?? value.enabled
  if (typeof explicit === 'boolean') return explicit
  const status = value.status
  if (typeof status === 'string') return !['disabled', 'revoked', 'inactive', 'deleted'].includes(status.toLowerCase())
  return true
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API ${field} is not an object`)
  return value
}

function readRequiredString(value: Record<string, unknown>, keys: readonly string[], field: string): string {
  for (const key of keys) {
    const hit = readOptionalString(value, key)
    if (hit !== undefined) return hit
  }
  throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response omitted ${field}`)
}

function readRequiredIdentifier(value: Record<string, unknown>, keys: readonly string[], field: string): string {
  for (const key of keys) {
    const hit = readOptionalIdentifier(value, key)
    if (hit !== undefined) return hit
  }
  throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response omitted ${field}`)
}

function readRequiredPositiveInteger(value: Record<string, unknown>, keys: readonly string[], field: string): number {
  for (const key of keys) {
    const hit = value[key]
    if (hit === undefined) continue
    if (typeof hit === 'number' && Number.isSafeInteger(hit) && hit > 0) return hit
    if (typeof hit === 'string' && /^\d+$/u.test(hit)) {
      const parsed = Number(hit)
      if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
    }
    throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response field ${key} is invalid`)
  }
  throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response omitted ${field}`)
}

function readOptionalIdentifier(value: Record<string, unknown>, key: string): string | undefined {
  const hit = value[key]
  if (hit === undefined) return undefined
  if (typeof hit === 'string') {
    if (hit.trim() === '') throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response field ${key} is invalid`)
    return hit
  }
  if (typeof hit === 'number' && Number.isSafeInteger(hit) && hit >= 0) return String(hit)
  throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response field ${key} is invalid`)
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const hit = value[key]
  if (hit === undefined) return undefined
  if (typeof hit !== 'string' || hit.trim() === '') throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response field ${key} is invalid`)
  return hit
}

function readOptionalStringOrEmpty(value: Record<string, unknown>, key: string): string | undefined {
  const hit = value[key]
  if (hit === '') return undefined
  return readOptionalString(value, key)
}

function readOptionalNumber(value: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const hit = value[key]
    if (hit === undefined) continue
    if (typeof hit !== 'number' || !Number.isFinite(hit) || hit < 0) throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response field ${key} is invalid`)
    return hit
  }
  return undefined
}

function readOptionalBoolean(value: Record<string, unknown>, keys: readonly string[]): boolean | undefined {
  for (const key of keys) {
    const hit = value[key]
    if (hit === undefined) continue
    if (typeof hit !== 'boolean') throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response field ${key} is invalid`)
    return hit
  }
  return undefined
}

function readOptionalGroupId(value: Record<string, unknown>): number | null | undefined {
  const hit = value.group_id ?? value.groupId
  if (hit === undefined) return undefined
  if (hit === null) return null
  if (typeof hit === 'number' && Number.isSafeInteger(hit) && hit > 0) return hit
  throw new Sub2apiError('SUB2API_BAD_RESPONSE', 'Sub2API response field group_id is invalid')
}

function readOptionalTimestamp(value: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const hit = value[key]
    if (hit === undefined) continue
    if (typeof hit === 'number' && Number.isFinite(hit) && hit >= 0) return hit
    if (typeof hit === 'string' && hit.trim() !== '') {
      const parsed = Date.parse(hit)
      if (Number.isFinite(parsed) && parsed >= 0) return parsed
    }
    throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response field ${key} is invalid`)
  }
  return undefined
}

function readBoolean(value: Record<string, unknown>, key: string): boolean {
  const hit = value[key]
  if (hit === undefined) return false
  if (typeof hit !== 'boolean') throw new Sub2apiError('SUB2API_BAD_RESPONSE', `Sub2API response field ${key} is invalid`)
  return hit
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim() === '') throw new Sub2apiError('SUB2API_BAD_REQUEST', `Sub2API ${field} is required`)
}

function supersededError(): Sub2apiError {
  return new Sub2apiError('SUB2API_CANCELLED', 'Sub2API operation was superseded by a newer account generation')
}
