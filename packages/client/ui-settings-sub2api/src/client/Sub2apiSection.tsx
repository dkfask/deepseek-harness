import { useEffect, useState, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  Sub2apiAccountSnapshot,
  Sub2apiGroupDescriptor,
  Sub2apiLoginInput,
  Sub2apiModelDescriptor,
  Sub2apiPublicSettings,
  Sub2apiRegisterInput,
  Sub2apiStateView,
  Sub2apiTwoFactorInput,
  Sub2apiUsageSnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Sub2apiLocaleKey } from './locales.ts'
import css from './Sub2apiSection.module.css'

/** Actions and event subscription supplied by the registration context. */
export interface Sub2apiSectionInjected {
  actions: {
    getState: () => Promise<RemoteResult<Sub2apiStateView>>
    register: (input: Sub2apiRegisterInput, signal?: AbortSignal) => Promise<RemoteResult<Sub2apiStateView>>
    login: (input: Sub2apiLoginInput, signal?: AbortSignal) => Promise<RemoteResult<Sub2apiStateView>>
    submit2FA: (input: Sub2apiTwoFactorInput, signal?: AbortSignal) => Promise<RemoteResult<Sub2apiStateView>>
    logout: () => Promise<RemoteResult<Sub2apiStateView>>
    refreshAccount: (signal?: AbortSignal) => Promise<RemoteResult<Sub2apiAccountSnapshot>>
    refreshModels: (signal?: AbortSignal) => Promise<RemoteResult<readonly Sub2apiModelDescriptor[]>>
    getAvailableGroups: (signal?: AbortSignal) => Promise<RemoteResult<readonly Sub2apiGroupDescriptor[]>>
    updateManagedKeyGroup: (groupId: number, signal?: AbortSignal) => Promise<RemoteResult<Sub2apiStateView>>
    getUsage: (signal?: AbortSignal) => Promise<RemoteResult<Sub2apiUsageSnapshot>>
    getPublicSettings: (signal?: AbortSignal) => Promise<RemoteResult<Sub2apiPublicSettings | undefined>>
    getRechargeUrl: (signal?: AbortSignal) => Promise<RemoteResult<string | undefined>>
  }
  subscribe: (listener: (state: Sub2apiStateView) => void) => () => void
}

/** Full props delivered by the settings section slot renderer. */
export type Sub2apiSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.sub2api'>
  & InjectFace<Sub2apiSectionInjected>

const INITIAL_STATE: Sub2apiStateView = { status: 'signed-out', generation: 0, updatedAt: 0 }
const ERROR_KEYS: Record<string, Sub2apiLocaleKey> = {
  SUB2API_NOT_AUTHENTICATED: 'notAuthenticated',
  SUB2API_REAUTH_REQUIRED: 'reauthRequired',
  SUB2API_2FA_REQUIRED: 'twoFactorRequired',
  SUB2API_KEY_REQUIRED: 'keyRequired',
  SUB2API_KEY_INVALID: 'keyInvalid',
  SUB2API_INSUFFICIENT_BALANCE: 'insufficientBalance',
  SUB2API_RATE_LIMITED: 'rateLimited',
  SUB2API_MODEL_UNAVAILABLE: 'modelUnavailable',
  SUB2API_PROTOCOL_MISMATCH: 'protocolMismatch',
  SUB2API_SERVICE_UNAVAILABLE: 'serviceUnavailable',
  SUB2API_ADMIN_COMPLIANCE_REQUIRED: 'adminComplianceRequired',
}

/** Render the account section with login, lifecycle, usage, and model controls. */
export function Sub2apiSection(props: Sub2apiSectionProps): ReactNode {
  const { actions, subscribe, t, openSection } = props
  const [state, setState] = useState(INITIAL_STATE)
  const [loaded, setLoaded] = useState(false)
  const [publicSettings, setPublicSettings] = useState<Sub2apiPublicSettings | undefined>()
  const [publicSettingsLoaded, setPublicSettingsLoaded] = useState(false)
  const [publicSettingsStatus, setPublicSettingsStatus] = useState<'unavailable' | 'available' | 'failed'>('unavailable')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<string | undefined>()
  const [failure, setFailure] = useState<string | undefined>()
  const [groups, setGroups] = useState<readonly Sub2apiGroupDescriptor[]>([])

  useEffect(() => {
    let active = true
    const dispose = subscribe((next) => { if (active) setState(next) })
    void actions.getState().then((result) => {
      if (!active) return
      if (result.ok) setState(result.value)
      else setFailure(failureText(result, t))
      setLoaded(true)
    }, () => {
      if (!active) return
      setFailure(t('requestFailed'))
      setLoaded(true)
    })
    void actions.getPublicSettings().then((result) => {
      if (!active) return
      if (result.ok) {
        setPublicSettings(result.value)
        setPublicSettingsStatus(result.value === undefined ? 'unavailable' : 'available')
      } else {
        setPublicSettingsStatus('failed')
      }
      setPublicSettingsLoaded(true)
    }, () => {
      if (!active) return
      setPublicSettings(undefined)
      setPublicSettingsStatus('failed')
      setPublicSettingsLoaded(true)
    })
    return () => { active = false; dispose() }
  }, [actions, subscribe, t])

  useEffect(() => {
    if (publicSettings?.registrationEnabled === false && mode === 'register') setMode('login')
  }, [mode, publicSettings])

  useEffect(() => {
    if (state.status !== 'authenticated' || state.account === undefined || state.models !== undefined) return
    void actions.refreshModels()
  }, [actions, state.account, state.models, state.status])

  useEffect(() => {
    if (state.status !== 'authenticated' || state.account === undefined) return
    let active = true
    void actions.getAvailableGroups().then((result) => {
      if (active && result.ok) setGroups(result.value)
    }, () => {
      if (active) setGroups([])
    })
    return () => { active = false }
  }, [actions, state.account, state.status])

  const run = async <T,>(name: string, operation: () => Promise<RemoteResult<T>>): Promise<T | undefined> => {
    setBusy(name)
    setFailure(undefined)
    try {
      const result = await operation()
      if (!result.ok) {
        setFailure(failureText(result, t))
        return undefined
      }
      return result.value
    } finally {
      setBusy(undefined)
    }
  }

  const submitAuth = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (email.trim() === '' || password === '') {
      setFailure(t('fieldRequired'))
      return
    }
    const input = { email: email.trim(), password }
    void run(mode === 'login' ? 'login' : 'register', () => mode === 'login'
      ? actions.login(input)
      : actions.register({ ...input, ...(captcha.trim() === '' ? {} : { verificationCode: captcha.trim() }) }))
      .then(() => { setPassword(''); setCaptcha('') })
  }

  const submitTwoFactor = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (code.trim() === '') { setFailure(t('fieldRequired')); return }
    void run('two-factor', () => actions.submit2FA({ code: code.trim() }))
      .then(() => { setCode('') })
  }

  const refreshAll = (): void => {
    setBusy('refresh-all')
    setFailure(undefined)
    void Promise.all([
      actions.refreshAccount(),
      actions.refreshModels(),
      actions.getUsage(),
    ]).then((results) => {
      let failed = false
      for (const result of results) {
        if (!result.ok) {
          setFailure(failureText(result, t))
          failed = true
          break
        }
      }
      if (!failed) setFailure(undefined)
    }).finally(() => { setBusy(undefined) })
  }

  const openRecharge = (): void => {
    setBusy('recharge')
    setFailure(undefined)
    void actions.getRechargeUrl().then((result) => {
      if (!result.ok) {
        setFailure(failureText(result, t))
        return
      }
      if (result.value === undefined) {
        setFailure(t('noRecharge'))
        return
      }
      const opened = window.open(result.value, '_blank', 'noopener,noreferrer')
      if (opened === null) setFailure(t('rechargeBlocked'))
    }).finally(() => { setBusy(undefined) })
  }

  if (!loaded || !publicSettingsLoaded) return <div className={css.section}><p className={css.status}>{t('loading')}</p></div>
  if (state.status === 'signed-out' || state.status === 'reauth-required') {
    const registrationEnabled = publicSettingsStatus === 'unavailable'
      || (publicSettingsStatus === 'available' && publicSettings?.registrationEnabled === true)
    return (
      <section className={css.section}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
        <div className={css.tabs} role="tablist" aria-label={t('title')}>
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? css.tabActive : css.tab} onClick={() => { setMode('login'); setFailure(undefined) }}>{t('login')}</button>
          {registrationEnabled && <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? css.tabActive : css.tab} onClick={() => { setMode('register'); setFailure(undefined) }}>{t('register')}</button>}
        </div>
        <form className={css.form} onSubmit={submitAuth}>
          <label>{t('email')}<input type="email" autoComplete="username" value={email} onChange={(event) => { setEmail(event.target.value) }} /></label>
          <label>{t('password')}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => { setPassword(event.target.value) }} /></label>
          {mode === 'register' && <label>{t('captcha')} <span className={css.optional}>{t('captchaOptional')}</span><input value={captcha} onChange={(event) => { setCaptcha(event.target.value) }} /></label>}
          <button className={css.primaryButton} type="submit" disabled={busy !== undefined}>{busy === mode ? (mode === 'login' ? t('signingIn') : t('registering')) : (mode === 'login' ? t('submitLogin') : t('submitRegister'))}</button>
        </form>
        {failure !== undefined && <p className={css.failure} role="alert">{failure}</p>}
      </section>
    )
  }
  if (state.status === 'two-factor-required') {
    return (
      <section className={css.section}>
        <h2 className={css.title}>{t('twoFactorTitle')}</h2>
        <p className={css.intro}>{t('twoFactorDescription')}</p>
        <form className={css.form} onSubmit={submitTwoFactor}>
          <label>{t('twoFactorCode')}<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => { setCode(event.target.value) }} /></label>
          <button className={css.primaryButton} type="submit" disabled={busy !== undefined}>{busy === 'two-factor' ? t('verifying') : t('verify')}</button>
        </form>
        {failure !== undefined && <p className={css.failure} role="alert">{failure}</p>}
      </section>
    )
  }

  if (state.account === undefined) {
    return (
      <section className={css.section}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.intro}>{t('intro')}</p>
        <p className={css.status}>{statusText(state.status, t)}</p>
        {failure !== undefined && <p className={css.failure} role="alert">{failure}</p>}
      </section>
    )
  }

  const stateFailure = state.error === undefined ? undefined : t(errorKey(state.error.code))
  const displayedFailure = failure ?? stateFailure
  const billingEnabled = publicSettingsStatus === 'unavailable'
    || (publicSettingsStatus === 'available' && publicSettings !== undefined
      && (publicSettings.paymentEnabled === true || publicSettings.subscriptionEnabled === true)
      && publicSettings.paymentBalanceDisabled !== true)

  return (
    <section className={css.section}>
      <div className={css.headingRow}><div><h2 className={css.title}>{t('account')}</h2><p className={css.intro}>{t('signedInAs')}: {state.account.email}</p></div><button className={css.secondaryButton} type="button" disabled={busy !== undefined} onClick={() => { void run('logout', actions.logout) }}>{busy === 'logout' ? t('signingOut') : t('signOut')}</button></div>
      <div className={css.cards}>
        <Metric label={t('balance')} value={formatBalance(state.usage, state.account.balance)} stale={state.usage?.stale === true} staleLabel={t('stale')} />
        <Metric label={t('usage')} value={formatUsage(state.usage)} stale={state.usage?.stale === true} staleLabel={t('stale')} />
        <Metric label={t('models')} value={t('modelCount', { count: String(state.models?.length ?? 0) })} stale={false} staleLabel={t('stale')} />
      </div>
      <div className={css.keyDetails}>
        <div className={css.keyDetailsHeading}>
          <span className={css.keyDetailsTitle}>{t('managedKey')}</span>
          <span className={css.keyDetailsSecret}>{t('keySecretHidden')}</span>
        </div>
        <div className={css.keyDetailsGrid}>
          <div><span>{t('keyName')}</span><strong>{state.apiKey?.name ?? '—'}</strong></div>
          <div><span>{t('group')}</span><strong>{groups.find(group => group.id === state.apiKey?.groupId)?.name
            ?? (state.apiKey?.groupId === undefined || state.apiKey.groupId === null ? t('groupUnassigned') : String(state.apiKey.groupId))}</strong></div>
          {state.apiKey?.fingerprint !== undefined && <div><span>{t('fingerprint')}</span><strong>{state.apiKey.fingerprint}</strong></div>}
        </div>
      </div>
      {openSection !== undefined && <div className={css.modelSettings}>
        <div className={css.modelSettingsCopy}>
          <span className={css.modelSettingsTitle}>{t('modelSettings')}</span>
          <p className={css.modelSettingsDescription}>{t('modelSettingsIntro')}</p>
        </div>
        <button className={css.secondaryButton} type="button" onClick={() => { openSection('models') }}>{t('openModelSettings')}</button>
      </div>}
      <div className={css.actions}>
        <button className={css.primaryButton} type="button" disabled={busy !== undefined} onClick={refreshAll}>{busy?.startsWith('refresh') ? t('refreshing') : t('refresh')}</button>
        {billingEnabled && <button className={css.secondaryButton} type="button" disabled={busy !== undefined} onClick={openRecharge}>{t('recharge')}</button>}
        {billingEnabled && <button className={css.secondaryButton} type="button" disabled={busy !== undefined} onClick={refreshAll}>{t('refreshAfterRecharge')}</button>}
      </div>
      {displayedFailure !== undefined && <p className={css.failure} role="alert">{displayedFailure}</p>}
      <p className={css.updated}>{t('updated')}: {formatUpdated(state.updatedAt)}</p>
    </section>
  )
}

function Metric({ label, value, stale, staleLabel }: { label: string; value: string; stale: boolean; staleLabel: string }): ReactNode {
  return <div className={css.metric}>
    <span className={css.metricLabel}>{label}</span>
    <strong>{value}</strong>
    {stale && <span className={css.stale}>{staleLabel}</span>}
  </div>
}

function formatBalance(usage: Sub2apiUsageSnapshot | undefined, accountBalance: number | undefined): string {
  const balance = usage?.balance ?? accountBalance
  if (balance === undefined) return '—'
  return `${usage?.currency ?? ''} ${balance}`.trim()
}

function formatUsage(usage: Sub2apiUsageSnapshot | undefined): string {
  if (usage?.used === undefined && usage?.limit === undefined) return '—'
  return `${usage.used ?? 0} / ${usage.limit ?? '—'}`
}

function formatUpdated(value: number): string {
  return value > 0 ? new Date(value).toLocaleString() : '—'
}

function failureText<T>(result: RemoteResult<T>, t: Sub2apiSectionProps['t']): string {
  if (result.ok) return ''
  const details = result.error.details
  const code = 'code' in details && typeof details.code === 'string'
    ? details.code
    : ''
  return t(errorKey(code))
}

function errorKey(code: string): Sub2apiLocaleKey {
  return ERROR_KEYS[code] ?? 'requestFailed'
}

function statusText(status: Sub2apiStateView['status'], t: Sub2apiSectionProps['t']): string {
  switch (status) {
    case 'authenticating': return t('authenticating')
    case 'refreshing': return t('refreshing')
    case 'key-required': return t('keyRequired')
    case 'insufficient-balance': return t('insufficientBalance')
    case 'signing-out': return t('signingOut')
    case 'signed-out': return t('notAuthenticated')
    case 'reauth-required': return t('reauthRequired')
    case 'two-factor-required': return t('twoFactorRequired')
    case 'authenticated': return t('loading')
  }
}
