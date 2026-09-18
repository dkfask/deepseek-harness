import { useEffect, useState, type ReactNode } from 'react'
import { IconUserOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { Sub2apiStateView } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Sub2apiSidebarAccount.module.css'

/** The account actions and subscription used by the sidebar footer card. */
export interface Sub2apiSidebarAccountInjected {
  actions: {
    getState: () => Promise<RemoteResult<Sub2apiStateView>>
  }
  subscribe: (listener: (state: Sub2apiStateView) => void) => () => void
}

/** Props supplied by the sidebar footer action slot and the Sub2API runtime. */
export type Sub2apiSidebarAccountProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'settings.sub2api'>
  & InjectFace<Sub2apiSidebarAccountInjected>

const INITIAL_STATE: Sub2apiStateView = { status: 'signed-out', generation: 0, updatedAt: 0 }

/** Render the signed-in Sub2API identity beside the settings trigger. */
export function Sub2apiSidebarAccount({ wide, actions, subscribe, t }: Sub2apiSidebarAccountProps): ReactNode {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    let active = true
    const dispose = subscribe((next) => { if (active) setState(next) })
    void actions.getState().then((result) => {
      if (active && result.ok) setState(result.value)
    }, () => {})
    return () => { active = false; dispose() }
  }, [actions, subscribe])

  const account = state.account
  if (account === undefined || state.status === 'signed-out' || state.status === 'signing-out') return null

  const displayName = account.displayName?.trim()
    || account.email?.split('@', 1)[0]
    || account.userId
  const secondary = state.models === undefined
    ? account.email ?? account.userId
    : t('modelsAvailable', { count: String(state.models.length) })

  return (
    <div className={css.account} aria-label={`${t('account')}: ${displayName}`} data-sub2api-account={account.userId}>
      <span className={css.avatar} aria-hidden="true"><IconUserOutline16 size={16} /></span>
      {wide && <span className={css.details}>
        <strong className={css.name}>{displayName}</strong>
        <span className={css.secondary}>{secondary}</span>
      </span>}
    </div>
  )
}
