import { useEffect, useState, type ReactNode } from 'react'
import { IconCheckOutline16, IconCloseOutline16, IconDatabaseOutline16, IconEditOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Sub2apiGroupDescriptor, Sub2apiModelSettingsInput, Sub2apiStateView } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Sub2apiModelsFooter.module.css'

/** Browser-only notification used to refresh the active conversation meter immediately after a model override is saved. */
const MODEL_CONTEXT_UPDATED_EVENT = 'dsh:sub2api-model-context-updated'

/** Actions and state subscription supplied by the Sub2API runtime. */
export interface Sub2apiModelsInjected {
  actions: {
    getState: () => Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<Sub2apiStateView>>
    refreshModels: (signal?: AbortSignal) => Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<readonly import('@deepseek-ai/dsh-api-remotes/client').Sub2apiModelDescriptor[]>>
    getAvailableGroups: (signal?: AbortSignal) => Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<readonly Sub2apiGroupDescriptor[]>>
    updateManagedKeyGroup: (groupId: number, signal?: AbortSignal) => Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<Sub2apiStateView>>
    updateModelSettings: (input: Sub2apiModelSettingsInput, signal?: AbortSignal) => Promise<import('@deepseek-ai/dsh-api-remotes/client').RemoteResult<Sub2apiStateView>>
  }
  subscribe: (listener: (state: Sub2apiStateView) => void) => () => void
}

/** Props supplied by the system-provider card and the Sub2API runtime. */
export type Sub2apiModelsFooterProps =
  PropsRuntime<'settings.models.provider-card'>
  & PropsLocale<'settings.sub2api'>
  & InjectFace<Sub2apiModelsInjected>

const INITIAL_STATE: Sub2apiStateView = { status: 'signed-out', generation: 0, updatedAt: 0 }

/** Render the authenticated Sub2API provider card below the configurable providers. */
export function Sub2apiModelsFooter({ provider, actions, subscribe, t }: Sub2apiModelsFooterProps): ReactNode {
  const [state, setState] = useState(INITIAL_STATE)
  const [editingGroup, setEditingGroup] = useState(false)
  const [groupDraft, setGroupDraft] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [groupError, setGroupError] = useState<string | undefined>()
  const [groups, setGroups] = useState<readonly Sub2apiGroupDescriptor[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [contextDrafts, setContextDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  const [contextBusy, setContextBusy] = useState<string | undefined>()
  const [contextError, setContextError] = useState<string | undefined>()

  useEffect(() => {
    let active = true
    const dispose = subscribe((next) => { if (active) setState(next) })
    void actions.getState().then(async (result) => {
      if (!active || !result.ok) return
      setState(result.value)
      if (result.value.account === undefined || result.value.status !== 'authenticated') return
      setGroupsLoading(true)
      try {
        const [refreshed, availableGroups] = await Promise.all([actions.refreshModels(), actions.getAvailableGroups()])
        if (active && refreshed.ok) setState(current => ({ ...current, models: refreshed.value }))
        if (active && availableGroups.ok) setGroups(availableGroups.value)
        if (active && !availableGroups.ok) setGroupError(t('groupsUnavailable'))
      } catch {
        if (active) setGroupError(t('groupsUnavailable'))
      } finally {
        if (active) setGroupsLoading(false)
      }
    }, () => { if (active) setGroupsLoading(false) })
    return () => { active = false; dispose() }
  }, [actions, subscribe, t])

  useEffect(() => {
    if (!editingGroup) setGroupDraft(state.apiKey?.groupId === undefined || state.apiKey.groupId === null ? '' : String(state.apiKey.groupId))
  }, [editingGroup, state.apiKey?.groupId])

  const saveGroup = async (): Promise<void> => {
    const groupId = Number(groupDraft)
    if (!Number.isSafeInteger(groupId) || groups.every(group => group.id !== groupId)) {
      setGroupError(t('groupUnavailable'))
      return
    }
    setGroupBusy(true)
    setGroupError(undefined)
    try {
      const result = await actions.updateManagedKeyGroup(groupId)
      if (!result.ok) {
        setGroupError(t('groupUpdateFailed'))
        return
      }
      setState(result.value)
      setEditingGroup(false)
      const refreshed = await actions.refreshModels()
      if (refreshed.ok) setState(current => ({ ...current, models: refreshed.value }))
    } catch {
      setGroupError(t('groupUpdateFailed'))
    } finally {
      setGroupBusy(false)
    }
  }

  const saveModelContext = async (modelId: string): Promise<void> => {
    const draft = contextDrafts.get(modelId) ?? ''
    const contextWindow = parseContextWindow(draft)
    if (contextWindow === undefined) {
      setContextError(t('modelContextInvalid'))
      return
    }
    setContextBusy(modelId)
    setContextError(undefined)
    try {
      const result = await actions.updateModelSettings({ modelId, contextWindow })
      if (!result.ok) {
        setContextError(t('modelContextUpdateFailed'))
        return
      }
      setState(result.value)
      window.dispatchEvent(new CustomEvent(MODEL_CONTEXT_UPDATED_EVENT, {
        detail: { provider: 'sub2api', model: modelId, contextWindow },
      }))
      setContextDrafts((current) => {
        const next = new Map(current)
        next.delete(modelId)
        return next
      })
    } catch {
      setContextError(t('modelContextUpdateFailed'))
    } finally {
      setContextBusy(undefined)
    }
  }

  if (provider.provider !== 'sub2api') return null
  if (state.account === undefined || state.status === 'signed-out' || state.status === 'signing-out') return null

  const connected = state.apiKey?.active === true
  const models = state.models ?? []
  return (
    <section className={css.section} aria-label={t('providerName')}>
      <header className={css.header}>
        <span className={css.icon} aria-hidden="true"><IconDatabaseOutline16 size={16} /></span>
        <div className={css.identity}>
          <strong className={css.providerName}>{t('providerName')}</strong>
          <span className={css.providerRoute}>{t('providerRoute')}</span>
        </div>
        <span className={css.status}>
          <span className={`${css.statusDot} ${connected ? css.statusDotConnected : css.statusDotMissing}`} aria-hidden="true" />
          {connected ? t('providerConnected') : t('providerUnavailable')}
        </span>
      </header>
      <div className={css.details}>
        <div className={css.detail}><span>{t('keyName')}</span><strong>{state.apiKey?.name ?? '—'}</strong></div>
        <div className={css.detail}>
          <span>{t('group')}</span>
          {editingGroup
            ? <form className={css.groupEditor} onSubmit={(event) => { event.preventDefault(); void saveGroup() }}>
              <select
                className={css.groupInput}
                value={groupDraft}
                aria-label={t('groupInputLabel')}
                onChange={(event) => { setGroupDraft(event.target.value); setGroupError(undefined) }}
                disabled={groupBusy || groupsLoading || groups.length === 0}
                autoFocus
              >
                <option value="">{groupsLoading ? t('loadingGroups') : t('selectGroup')}</option>
                {groups.map(group => <option key={group.id} value={String(group.id)}>{group.name}</option>)}
              </select>
              <span className={css.groupActions}>
                <button className={css.groupButton} type="submit" aria-label={groupBusy ? t('updatingGroup') : t('saveGroup')} disabled={groupBusy}>
                  <IconCheckOutline16 size={14} />
                </button>
                <button className={css.groupButton} type="button" aria-label={t('cancel')} disabled={groupBusy} onClick={() => { setEditingGroup(false); setGroupError(undefined) }}>
                  <IconCloseOutline16 size={14} />
                </button>
              </span>
            </form>
            : <span className={css.detailValue}>
              <strong>{groups.find(group => group.id === state.apiKey?.groupId)?.name
                ?? (state.apiKey?.groupId === undefined || state.apiKey.groupId === null ? t('groupUnassigned') : String(state.apiKey.groupId))}</strong>
              {state.apiKey?.id !== undefined && <button className={css.groupButton} type="button" aria-label={t('editGroup')} onClick={() => { setGroupDraft(state.apiKey?.groupId === undefined || state.apiKey.groupId === null ? '' : String(state.apiKey.groupId)); setGroupError(undefined); setEditingGroup(true) }}>
                <IconEditOutline16 size={14} />
              </button>}
            </span>}
          {groupError !== undefined && <span className={css.groupError} role="alert">{groupError}</span>}
        </div>
        <div className={css.detail}><span>{t('keySecretHidden')}</span><strong>{t('managedKey')}</strong></div>
      </div>
      <div className={css.models}>
        <div className={css.modelsHeading}>
          <strong>{t('discoveredModels')}</strong>
          <span>{models.length}</span>
        </div>
        {models.length === 0
          ? <p className={css.empty}>{t('noDiscoveredModels')}</p>
          : <ul className={css.modelList}>
            {models.map(model => (
              <li key={model.id} className={css.modelRow}>
                <div className={css.modelIdentity}>
                  <strong className={css.modelId}>{model.displayName ?? model.id}</strong>
                  <span className={css.modelRoute}>{model.endpointFamily}</span>
                </div>
                <form className={css.contextEditor} onSubmit={(event) => { event.preventDefault(); void saveModelContext(model.id) }}>
                  <label className={css.contextLabel}>
                    <span>{t('modelContextWindow')}</span>
                    <input
                      className={css.contextInput}
                      type="text"
                      inputMode="numeric"
                      value={contextDrafts.get(model.id) ?? (model.contextWindow === undefined ? '' : String(model.contextWindow))}
                      placeholder={t('modelContextPlaceholder')}
                      aria-label={`${t('modelContextWindow')} ${model.displayName ?? model.id}`}
                      onChange={(event) => {
                        const value = event.target.value
                        setContextDrafts(current => new Map(current).set(model.id, value))
                        setContextError(undefined)
                      }}
                      disabled={contextBusy !== undefined}
                    />
                  </label>
                  <button className={css.contextButton} type="submit" aria-label={contextBusy === model.id ? t('savingModelContext') : t('saveModelContext')} disabled={contextBusy !== undefined}>
                    <IconCheckOutline16 size={14} />
                  </button>
                </form>
              </li>
            ))}
          </ul>}
        {contextError !== undefined && <span className={css.groupError} role="alert">{contextError}</span>}
      </div>
    </section>
  )
}

function parseContextWindow(value: string): number | undefined {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*([kKmMgG])?$/.exec(value.trim())
  if (match === null) return undefined
  const amount = Number(match[1])
  const multiplier = match[2] === undefined ? 1 : match[2].toLowerCase() === 'k' ? 1_000 : match[2].toLowerCase() === 'm' ? 1_000_000 : 1_000_000_000
  const result = amount * multiplier
  return Number.isSafeInteger(result) && result > 0 ? result : undefined
}
