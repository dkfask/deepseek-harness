import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './Brand.module.css'

/** Render the ThunderUni mark at the size requested by its sidebar host. */
export function ThunderUniBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <ThunderUniMark size={size} />
}

/** Render the localized ThunderUni wordmark without duplicating the sidebar mark. */
export function ThunderUniBrandName({ t }: PropsLocale<'thunderuni'>) {
  return <span className={css.name}>{t('name')}</span>
}

/** Compact ThunderUni lightning mark. */
function ThunderUniMark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M13.9 2 5 13.1h5.6L9.5 22 19 10.2h-5.7L13.9 2Z" fill="currentColor" />
    </svg>
  )
}
