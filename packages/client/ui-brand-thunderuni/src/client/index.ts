import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ThunderUniBrandMark, ThunderUniBrandName, ThunderUniHeroBrandMark } from './Brand.tsx'
import { en, zh, type ThunderUniKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** ThunderUni brand copy. */
    thunderuni: ThunderUniKey
  }
}

/** Namespace owned by this plugin's localized brand copy. */
const NS = 'thunderuni'

/** Client services required by the ThunderUni brand plugin. */
export const inject = ['slots', 'locale']

/** Register ThunderUni brand occupants for the ThunderUni client build. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-brand-thunderuni: dictionaries')
  if (process.env.DSH_CLIENT_BUILD_PROFILE !== 'thunderuni') return

  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.mark', () =>
      ctx.slots.inject('sidebar.brand.name', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, ThunderUniBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, ThunderUniBrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, ThunderUniHeroBrandMark)
      })))
}
