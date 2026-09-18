/** Persistent per-model settings owned by the Sub2API provider. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace persisted by the Host settings provider. */
export const SUB2API_MODEL_SETTINGS_NAMESPACE = 'sub2api-models' as const

/** User-owned overrides applied to one discovered Sub2API model. */
export interface Sub2apiModelOverride {
  readonly contextWindow?: number
}

/** Resolved value of the Sub2API model-settings namespace. */
export interface Sub2apiModelSettings {
  readonly modelOverrides: Readonly<Record<string, Sub2apiModelOverride>>
}

const modelOverride = z.object({
  contextWindow: z.number().step(1).min(1),
})

/** Schema used for the user-editable Sub2API model settings namespace. */
export const Sub2apiModelSettingsSchema: z<Sub2apiModelSettings> = z.object({
  modelOverrides: z.dict(modelOverride),
})

/** Persistence adapter consumed by the Sub2API runtime. */
export interface Sub2apiModelSettingsStore {
  /** Read the resolved model overrides. */
  get(): Readonly<Record<string, Sub2apiModelOverride>>
  /** Persist one model's override. */
  update(modelId: string, override: Sub2apiModelOverride): Promise<void>
}
