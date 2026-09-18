/** Browser settings section for the secret-free Sub2API account projection. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  Sub2apiAccountSnapshot,
  Sub2apiLoginInput,
  Sub2apiModelDescriptor,
  Sub2apiModelSettingsInput,
  Sub2apiRegisterInput,
  Sub2apiStateView,
  Sub2apiTwoFactorInput,
  Sub2apiUsageSnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { Sub2apiSection } from './Sub2apiSection.tsx'
import type { Sub2apiSectionInjected } from './Sub2apiSection.tsx'
import { Sub2apiSidebarAccount } from './Sub2apiSidebarAccount.tsx'
import type { Sub2apiSidebarAccountInjected } from './Sub2apiSidebarAccount.tsx'
import { Sub2apiModelsFooter } from './Sub2apiModelsFooter.tsx'
import type { Sub2apiModelsInjected } from './Sub2apiModelsFooter.tsx'
import { en, zh, type Sub2apiLocaleKey } from './locales.ts'

export type { Sub2apiSectionInjected, Sub2apiSectionProps } from './Sub2apiSection.tsx'
export type { Sub2apiSidebarAccountInjected, Sub2apiSidebarAccountProps } from './Sub2apiSidebarAccount.tsx'
export type { Sub2apiLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sub2API account and gateway settings copy. */
    'settings.sub2api': Sub2apiLocaleKey
  }
}

const NS = 'settings.sub2api'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.sub2api']

/** Register the account section and forward secret-free Host state changes. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-sub2api: dictionaries')
  const actions: Sub2apiSectionInjected['actions'] = {
    getState: () => ctx.remote.sub2api.getState(),
    register: (input, signal) => ctx.remote.sub2api.register(input, signal),
    login: (input, signal) => ctx.remote.sub2api.login(input, signal),
    submit2FA: (input, signal) => ctx.remote.sub2api.submit2FA(input, signal),
    logout: () => ctx.remote.sub2api.logout(),
    refreshAccount: signal => ctx.remote.sub2api.refreshAccount(signal),
    refreshModels: signal => ctx.remote.sub2api.refreshModels(signal),
    getAvailableGroups: signal => ctx.remote.sub2api.getAvailableGroups(signal),
    updateManagedKeyGroup: (groupId, signal) => ctx.remote.sub2api.updateManagedKeyGroup(groupId, signal),
    getUsage: signal => ctx.remote.sub2api.getUsage(signal),
    getPublicSettings: signal => ctx.remote.sub2api.getPublicSettings(signal),
    getRechargeUrl: signal => ctx.remote.sub2api.getRechargeUrl(signal),
  }
  const injected = (): Sub2apiSectionInjected => ({
    actions,
    subscribe: listener => ctx.remote.$on('sub2api/state-changed', listener),
  })
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'sub2api',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, Sub2apiSection))
  const sidebarInjected = (): Sub2apiSidebarAccountInjected => ({
    actions: { getState: actions.getState },
    subscribe: injected().subscribe,
  })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'sub2api-account',
    order: -100,
    locale: NS,
    inject: sidebarInjected,
  }, Sub2apiSidebarAccount))
  const modelsInjected = (): Sub2apiModelsInjected => ({
    actions: {
      getState: actions.getState,
      refreshModels: actions.refreshModels,
      getAvailableGroups: actions.getAvailableGroups,
      updateManagedKeyGroup: actions.updateManagedKeyGroup,
      updateModelSettings: input => ctx.remote.sub2api.updateModelSettings(input),
    },
    subscribe: injected().subscribe,
  })
  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card',
    key: '',
    priority: -100,
    locale: NS,
    inject: modelsInjected,
  }, Sub2apiModelsFooter))
}

/** Result envelope returned by a Sub2API Remote operation. */
export type Sub2apiResult<T> = RemoteResult<T>

/** Actions injected into the Sub2API settings section. */
export type Sub2apiActions = Sub2apiSectionInjected['actions']

/** Secret-free snapshots rendered by the Sub2API settings section. */
export type Sub2apiSnapshots = {
  account: Sub2apiAccountSnapshot
  models: readonly Sub2apiModelDescriptor[]
  state: Sub2apiStateView
  usage: Sub2apiUsageSnapshot
}
export type {
  Sub2apiLoginInput,
  Sub2apiModelSettingsInput,
  Sub2apiRegisterInput,
  Sub2apiTwoFactorInput,
}
