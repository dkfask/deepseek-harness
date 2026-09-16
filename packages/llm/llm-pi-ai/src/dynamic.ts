/**
 * Explicit construction helpers for provider routes whose model catalog is
 * learned at runtime rather than declared in settings.
 *
 * The helper deliberately keeps model capacities required. A discovery
 * response that does not carry capacities must be completed by the owning
 * integration before it is advertised; pi-ai cannot represent an unknown
 * capacity without inventing a value.
 *
 * @module dsh-llm-pi-ai/dynamic
 */

import type { Api, Model, ModelCost } from '@earendil-works/pi-ai'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_INPUT,
  DEFAULT_MAX_REQUEST_IMAGE_BYTES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
  DEFAULT_REQUEST_IMAGE_MAX_BYTES,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
} from './config.ts'
import type { PiAiModality, ResolvedPiAiProviderProfile } from './config.ts'
import { buildProvider } from './provider.ts'

/** Zero-cost metadata used when a gateway does not publish billing rates. */
const NO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** One runtime-discovered model with explicit capacities. */
export interface DynamicPiAiModel {
  /** Exact model id accepted by the gateway. */
  readonly id: string
  /** Human-readable model name; defaults to {@link id}. */
  readonly name?: string
  /** Positive context-window capacity reported or configured by the owner. */
  readonly contextWindow?: number
  /** Positive output capacity reported or configured by the owner. */
  readonly maxTokens?: number
  /** Request modalities; omission uses the explicit route default. */
  readonly input?: readonly PiAiModality[]
  /** Whether the gateway has verified reasoning for this model. */
  readonly reasoning?: boolean
}

/** All route facts needed to construct a runtime-discovered pi-ai profile. */
export interface DynamicPiAiProfileOptions {
  /** Harness provider route and pi-ai provider id. */
  readonly provider: string
  /** Selector-facing provider name. */
  readonly displayName: string
  /** pi-ai protocol accepted by every model in this route. */
  readonly api: string
  /** Absolute gateway endpoint. */
  readonly baseURL: string
  /** Last-known runtime model catalog; may be empty before discovery. */
  readonly models: readonly DynamicPiAiModel[]
  /** Credential reference, when the route uses the generic resolver. */
  readonly apiKeyEnv?: string
  /** Route-level request headers. */
  readonly headers?: Readonly<Record<string, string>>
  /** Explicit fallback context capacity for models without metadata. */
  readonly defaultContextWindow?: number
  /** Explicit fallback output capacity for models without metadata. */
  readonly defaultMaxTokens?: number
  /** Explicit fallback modality list for models without metadata. */
  readonly defaultInput?: readonly PiAiModality[]
  /** Retry policy captured by the LLM registry. */
  readonly retryPolicy?: RetryPolicyConfig
  /** Provider timeout. */
  readonly timeoutMs?: number
  /** Stream idle timeout. */
  readonly streamIdleTimeoutMs?: number
  /** Maximum request image payload. */
  readonly maxRequestImageBytes?: number
  /** Request image pixel budget. */
  readonly requestImagePixelBudget?: number
  /** Request image encoded-byte target. */
  readonly requestImageMaxBytes?: number
}

/**
 * Build a resolved profile for a dynamic route.
 *
 * The capacity fallbacks are explicit options of this function's owner. The
 * defaults mirror the generic adapter only so a caller can opt into the same
 * documented policy; integrations that cannot justify them should omit model
 * entries until their own deployment profile supplies the facts.
 *
 * @param options - runtime route and model facts.
 * @returns a profile accepted by {@link PiAiAdapter}.
 */
export function createDynamicPiAiProfile(options: DynamicPiAiProfileOptions): ResolvedPiAiProviderProfile {
  const defaultContextWindow = positiveCapacity(
    options.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    'defaultContextWindow',
  )
  const defaultMaxTokens = positiveCapacity(options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS, 'defaultMaxTokens')
  const defaultInput = [...options.defaultInput ?? DEFAULT_INPUT]
  if (defaultInput.length === 0) throw new Error('llm-pi-ai dynamic profile: defaultInput must not be empty')
  const models = options.models.map(model => dynamicModel(model, options, defaultContextWindow, defaultMaxTokens, defaultInput))
  const piProvider = buildProvider({
    provider: options.provider,
    displayName: options.displayName,
    api: options.api,
    baseURL: options.baseURL,
    models,
    namesCredential: options.apiKeyEnv !== undefined,
  })
  return {
    provider: options.provider,
    displayName: options.displayName,
    api: options.api,
    baseURL: options.baseURL,
    ...(options.apiKeyEnv === undefined ? {} : { apiKeyEnv: credentialRef(options.apiKeyEnv) }),
    ...(options.headers === undefined ? {} : { headers: { ...options.headers } }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    streamIdleTimeoutMs: options.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: options.maxRequestImageBytes ?? DEFAULT_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: options.requestImagePixelBudget ?? DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: options.requestImageMaxBytes ?? DEFAULT_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(options.retryPolicy, `llm-pi-ai: provider "${options.provider}" retryPolicy`),
    modelErrors: new Map(),
    configuredMaxTokens: new Map(),
    piProvider,
  }
}

function dynamicModel(
  input: DynamicPiAiModel,
  options: DynamicPiAiProfileOptions,
  defaultContextWindow: number,
  defaultMaxTokens: number,
  defaultInput: readonly PiAiModality[],
): Model<Api> {
  if (input.id.trim() === '') throw new Error('llm-pi-ai dynamic profile: model id must be non-empty')
  return {
    id: input.id,
    name: input.name ?? input.id,
    api: options.api,
    provider: options.provider,
    baseUrl: options.baseURL,
    reasoning: input.reasoning ?? false,
    input: [...input.input ?? defaultInput],
    cost: NO_COST,
    contextWindow: positiveCapacity(input.contextWindow ?? defaultContextWindow, `model ${input.id} contextWindow`),
    maxTokens: positiveCapacity(input.maxTokens ?? defaultMaxTokens, `model ${input.id} maxTokens`),
  }
}

function positiveCapacity(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`llm-pi-ai dynamic profile: ${field} must be a positive safe integer`)
  return value
}
