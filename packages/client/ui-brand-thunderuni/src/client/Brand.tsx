import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './Brand.module.css'
import { THUNDERUNI_LOGO_DATA_URI } from './logo.ts'

/** Render the ThunderUni mark at the size requested by its sidebar host. */
export function ThunderUniBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <img className={css.mark} src={THUNDERUNI_LOGO_DATA_URI} width={size} height={size} alt="" aria-hidden="true" />
}

/** Render the same supplied ThunderUni mark in the blank-session hero. */
export function ThunderUniHeroBrandMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <img className={className ?? css.mark} src={THUNDERUNI_LOGO_DATA_URI} width={size} height={size} alt="" aria-hidden="true" />
}

/** Render the localized ThunderUni wordmark without duplicating the sidebar mark. */
export function ThunderUniBrandName({ t }: PropsLocale<'thunderuni'>) {
  return <span className={css.name}>{t('name')}</span>
}
