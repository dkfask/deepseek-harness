/** Wire-safe and durable types for the experimental Sub2API foundation. @module @deepseek-ai/dsh-experimental-sub2api/types */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Secret-free account, usage, and model projection changed.
     * @mode emit
     * @param state - detached account, usage, and model state.
     */
    'sub2api/state-changed'(state: Sub2apiStateView): void
  }
}

/** A secret accepted by the Sub2API record parser; its brand prevents accidental mixing with ordinary text. */
export type Sub2apiSecret = Branded<'Sub2apiSecret'>

/** A deployment fingerprint that binds a stored grant to one configured service. */
export type Sub2apiDeploymentFingerprint = Branded<'Sub2apiDeploymentFingerprint'>

/** Host-side account lifecycle states. */
export type Sub2apiAuthState =
  | 'signed-out'
  | 'authenticating'
  | 'two-factor-required'
  | 'authenticated'
  | 'refreshing'
  | 'reauth-required'
  | 'key-required'
  | 'insufficient-balance'
  | 'signing-out'

/** Response envelope forms supported by a configured Sub2API deployment. */
export type Sub2apiResponseEnvelope = 'direct' | 'data' | 'both'

/** Authentication header accepted by the model gateway. */
export type Sub2apiGatewayAuthScheme = 'api-key' | 'bearer' | 'both'

/** Account endpoint paths relative to the configured account API base. */
export interface Sub2apiAccountPaths {
  readonly login: string
  readonly register: string
  readonly loginTwoFactor?: string
  readonly refresh?: string
  readonly me: string
  readonly apiKeys: string
  readonly usage?: string
  readonly recharge?: string
}

/** Gateway endpoint paths relative to the configured model API base. */
export interface Sub2apiGatewayPaths {
  readonly models: string
  readonly chatCompletions: string
}

/** Fully normalized protocol profile used by later Host providers. */
export interface Sub2apiProtocolProfile {
  readonly version: string
  /** Exact development origins for which HTTP was explicitly allowed. */
  readonly allowInsecureHttpOrigins: readonly string[]
  readonly accountBaseUrl: string
  readonly gatewayBaseUrl: string
  readonly account: {
    readonly paths: Sub2apiAccountPaths
    readonly responseEnvelope: Sub2apiResponseEnvelope
  }
  readonly gateway: {
    readonly paths: Sub2apiGatewayPaths
    readonly responseEnvelope: Sub2apiResponseEnvelope
    readonly authScheme: Sub2apiGatewayAuthScheme
  }
}

/** Safe protocol facts exposed to model and Remote consumers. */
export type Sub2apiProfileView = Sub2apiProtocolProfile

/** Account metadata safe to publish to a settings or Remote projection. */
export interface Sub2apiAccountSummary {
  readonly userId: string
  readonly email?: string
  readonly displayName?: string
}

/** Credentials accepted by a Sub2API registration request. */
export interface Sub2apiRegisterInput {
  readonly email: string
  readonly password: string
  readonly captcha?: string
  readonly verificationCode?: string
}

/** Credentials accepted by a Sub2API login request. */
export interface Sub2apiLoginInput {
  readonly email: string
  readonly password: string
}

/** One short-lived second-factor submission. */
export interface Sub2apiTwoFactorInput {
  readonly code: string
}

/** Authentication material returned by a protocol codec; secrets stay Host-only. */
export interface Sub2apiAuthenticationGrant {
  readonly accessToken: Sub2apiSecret
  readonly refreshToken?: Sub2apiSecret
  readonly refreshTokenType?: string
  readonly expiresAt?: number
  readonly expiresIn?: number
  readonly twoFactorRequired?: false
}

/** Authentication challenge returned before an access token is issued. */
export interface Sub2apiTwoFactorChallenge {
  readonly twoFactorRequired: true
  readonly challenge?: string
}

/** Authentication result decoded from one account response. */
export type Sub2apiAuthenticationResult = Sub2apiAuthenticationGrant | Sub2apiTwoFactorChallenge

/** Non-secret metadata for one managed or user-owned API Key. */
export interface Sub2apiApiKeyDescriptor {
  readonly id?: string
  readonly name: string
  readonly active: boolean
  readonly createdAt?: number
  readonly fingerprint?: string
  readonly secret?: Sub2apiSecret
}

/** Model discovery metadata; unverified capabilities remain `unknown`. */
export interface Sub2apiModelDescriptor {
  readonly id: string
  readonly displayName?: string
  readonly endpointFamily: 'chat-completions' | 'responses' | 'unknown'
  readonly supportsStreaming: 'verified' | 'unsupported' | 'unknown'
  readonly supportsTools: 'verified' | 'unsupported' | 'unknown'
  readonly supportsVision: 'verified' | 'unsupported' | 'unknown'
  readonly supportsReasoning: 'verified' | 'unsupported' | 'unknown'
  readonly supportsResponses: 'verified' | 'unsupported' | 'unknown'
  readonly contextWindow?: number
  readonly maxOutputTokens?: number
  readonly source: 'fixture' | 'server-metadata' | 'configured' | 'unknown'
}

/** Account balance and usage data safe for UI and Remote projections. */
export interface Sub2apiUsageSnapshot {
  readonly balance?: number
  readonly currency?: string
  readonly used?: number
  readonly limit?: number
  readonly asOf: number
  readonly stale: boolean
}

/** Host-only API Key snapshot used by a model gateway request. */
export interface Sub2apiGatewayCredential {
  readonly deploymentFingerprint: Sub2apiDeploymentFingerprint
  readonly generation: number
  readonly apiKey: Sub2apiSecret
}

/** Authenticated account data returned by the Host runtime. */
export interface Sub2apiAccountSnapshot {
  readonly account: Sub2apiAccountSummary
  readonly asOf: number
  readonly stale: boolean
}

/** Combined state view returned by the Host runtime. */
export interface Sub2apiStateView extends Sub2apiRuntimeSnapshot {
  readonly usage?: Sub2apiUsageSnapshot
  readonly models?: readonly Sub2apiModelDescriptor[]
}

/** Redacted view of the durable grant; no token or key secret crosses this type. */
export interface Sub2apiGrantRecordRedacted {
  readonly version: 1
  readonly deployment: {
    readonly origin: string
    readonly fingerprint: string
  }
  readonly account: Sub2apiAccountSummary
  readonly auth: {
    readonly hasRefreshToken: boolean
  }
  readonly apiKey: {
    readonly id?: string
    readonly name: string
    readonly fingerprint?: string
    readonly createdAt?: number
    readonly configured: true
  }
  readonly generation: number
  readonly updatedAt: number
}

/** Version-one durable grant kept by the Host credential provider. */
export interface Sub2apiGrantRecordV1 {
  readonly version: 1
  readonly deployment: {
    readonly origin: string
    readonly fingerprint: Sub2apiDeploymentFingerprint
  }
  readonly account: Sub2apiAccountSummary
  readonly auth: {
    readonly refreshToken?: Sub2apiSecret
    readonly refreshTokenType?: string
    readonly lastRefreshAt?: number
  }
  readonly apiKey: {
    readonly id?: string
    readonly name: string
    readonly secret: Sub2apiSecret
    readonly fingerprint?: string
    readonly createdAt?: number
  }
  readonly generation: number
  readonly updatedAt: number
}

/** A redacted, stable error summary suitable for settings and Remote output. */
export interface Sub2apiErrorSummary {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly retryAfterMs?: number
}

/** The Host state that can be projected without exposing a credential value. */
export interface Sub2apiRuntimeSnapshot {
  readonly status: Sub2apiAuthState
  readonly generation: number
  readonly account?: Sub2apiAccountSummary
  readonly error?: Sub2apiErrorSummary
  readonly updatedAt: number
}

/** One timestamped event accepted by the account state machine. */
export type Sub2apiStateEvent =
  | { readonly type: 'begin-authentication'; readonly at: number }
  | { readonly type: 'two-factor-required'; readonly at: number }
  | { readonly type: 'authenticated'; readonly account: Sub2apiAccountSummary; readonly at: number }
  | { readonly type: 'begin-refresh'; readonly at: number }
  | { readonly type: 'refresh-succeeded'; readonly account: Sub2apiAccountSummary; readonly at: number }
  | { readonly type: 'reauth-required'; readonly at: number }
  | { readonly type: 'key-required'; readonly at: number }
  | { readonly type: 'insufficient-balance'; readonly at: number }
  | { readonly type: 'begin-sign-out'; readonly at: number }
  | { readonly type: 'signed-out'; readonly at: number }
  | { readonly type: 'credential-replaced'; readonly at: number }
  | { readonly type: 'deployment-changed'; readonly at: number }

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Secret-free Sub2API operation failure returned by the Remote owner. */
    'sub2api/failed': {
      readonly code: string
      readonly retryable: boolean
      readonly httpStatus?: number
      readonly retryAfterMs?: number
    }
  }
}
