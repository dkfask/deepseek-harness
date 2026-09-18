/** One Host-generation model catalog shared by every Session selector. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Observable lifecycle of the shared model catalog. */
export interface ModelCatalogState {
  value: ModelCatalog | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

/** Loads at most one model catalog for the current Host generation. */
export class ModelCatalogDirectory {
  /** Current shared catalog value and load lifecycle. */
  readonly store: SnapshotStore<ModelCatalogState> = createSnapshotStore({
    value: null,
    status: 'idle',
    error: null,
  })

  private generation = 0
  private inflight: Promise<ModelCatalog> | undefined

  /**
   * @param ctx - the providing plugin's context, whose `remote.session`
   * namespace carries the Host-generation catalog.
   */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Return the current generation's catalog, sharing its one in-flight load.
   * @returns the loaded global catalog.
   */
  load(): Promise<ModelCatalog> {
    const state = this.store.getSnapshot()
    if (state.status === 'ready' && state.value !== null) return Promise.resolve(state.value)
    if (this.inflight !== undefined) return this.inflight
    const generation = this.generation
    this.store.update((draft) => {
      draft.status = 'loading'
      draft.error = null
    })
    const operation = this.ctx.remote.session.modelCatalog().then((response) => {
      if (!response.ok) {
        throw new Error(`${response.error.code}: ${response.error.message}`)
      }
      const value = deploymentCatalog(response.value)
      if (generation === this.generation) {
        this.store.set({ value, status: 'ready', error: null })
      }
      return value
    }).catch((error: unknown) => {
      if (generation === this.generation) {
        this.store.update((draft) => {
          draft.status = 'error'
          draft.error = error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }).finally(() => {
      if (generation === this.generation && this.inflight === operation) this.inflight = undefined
    })
    this.inflight = operation
    return operation
  }

  /**
   * Invalidate the loaded catalog; the next explicit menu read reloads it.
   * @param clear - whether values from the previous Host generation must be hidden.
   */
  private invalidate(clear = false): void {
    this.generation += 1
    this.inflight = undefined
    const value = clear ? null : this.store.getSnapshot().value
    this.store.set({ value, status: 'idle', error: null })
  }

  /** Invalidate and reload the catalog after a Host-side model input changes. */
  refresh(): void {
    this.invalidate()
    void this.load().catch(() => { /* the selector exposes the shared error */ })
  }

  /** Clear Host-specific values and load the replacement Host generation. */
  resetGeneration(): void {
    this.invalidate(true)
    void this.load().catch(() => { /* the selector exposes the shared error */ })
  }
}

/**
 * Keep a deployment-owned Sub2API catalog from exposing the built-in DeepSeek
 * route in model selection. The adapter can remain mounted for auxiliary Host
 * services, but it is not a user-selectable model in this deployment.
 * @param catalog - Host model catalog before deployment filtering.
 * @returns the catalog projected for the current deployment.
 */
function deploymentCatalog(catalog: ModelCatalog): ModelCatalog {
  const sub2api = catalog.groups.find(group => group.id === 'sub2api')
  if (sub2api === undefined || sub2api.models.length === 0) return catalog
  const groups = catalog.groups.filter(group => group.id !== 'deepseek-official')
  const defaultGroup = groups.find(group => group.id === catalog.default.provider)
  const defaultModel = defaultGroup?.models.find(model => model.id === catalog.default.model)
  const fallback = sub2api.models[0]
  if (fallback === undefined) return catalog
  return {
    ...catalog,
    default: defaultModel === undefined
      ? { provider: 'sub2api', model: fallback.id }
      : catalog.default,
    routableProviders: catalog.routableProviders.filter(provider => provider !== 'deepseek-official'),
    groups,
    failures: catalog.failures.filter(failure => failure.id !== 'deepseek-official'),
  }
}
