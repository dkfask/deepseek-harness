// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { Sub2apiStateView } from '@deepseek-ai/dsh-api-remotes/client'
import type { Sub2apiSectionProps } from '../src/client/Sub2apiSection.tsx'
import { Sub2apiSection } from '../src/client/Sub2apiSection.tsx'

afterEach(cleanup)

const authenticated: Sub2apiStateView = {
  status: 'authenticated',
  generation: 1,
  updatedAt: 1,
  account: { userId: 'user-1', email: 'traveler6677@example.test', displayName: '旅行者6677' },
  models: [],
}

function translate(key: string, params?: Record<string, string>): string {
  const copy: Record<string, string> = {
    loading: '加载中',
    account: '账户',
    signedInAs: '当前账户',
    balance: '余额',
    usage: '用量',
    models: '模型',
    modelCount: `模型 ${params?.count ?? '0'} 个`,
    modelSettings: '模型设置',
    modelSettingsIntro: '可以使用本部署提供的模型，也可以添加其他提供方和模型。',
    openModelSettings: '管理模型',
    refresh: '刷新',
    refreshAfterRecharge: '充值后刷新',
    recharge: '充值',
    signOut: '退出登录',
    updated: '更新时间',
  }
  return copy[key] ?? key
}

function props(openSection: (id: string) => void): Sub2apiSectionProps {
  const result = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
  return {
    close: vi.fn(),
    openSection,
    actions: {
      getState: () => result(authenticated),
      register: vi.fn(),
      login: vi.fn(),
      submit2FA: vi.fn(),
      logout: vi.fn(),
      refreshAccount: vi.fn(),
      refreshModels: vi.fn(),
      getAvailableGroups: () => result([]),
      getUsage: vi.fn(),
      getPublicSettings: () => result({ registrationEnabled: false }),
      getRechargeUrl: vi.fn(),
    },
    subscribe: vi.fn(() => () => {}),
    t: translate,
  } as unknown as Sub2apiSectionProps
}

describe('Sub2apiSection model settings', () => {
  it('opens the existing models section from the authenticated account view', async () => {
    const openSection = vi.fn()
    render(<Sub2apiSection {...props(openSection)} />)

    await waitFor(() => { expect(screen.getByText('模型设置')).toBeTruthy() })
    expect(screen.getByText('管理模型')).toBeTruthy()
    screen.getByRole('button', { name: '管理模型' }).click()
    expect(openSection).toHaveBeenCalledWith('models')
  })
})
