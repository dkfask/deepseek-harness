// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { Sub2apiStateView } from '@deepseek-ai/dsh-api-remotes/client'
import type { Sub2apiSidebarAccountProps } from '../src/client/Sub2apiSidebarAccount.tsx'
import { Sub2apiSidebarAccount } from '../src/client/Sub2apiSidebarAccount.tsx'

afterEach(cleanup)

const signedOut: Sub2apiStateView = { status: 'signed-out', generation: 0, updatedAt: 0 }

function translate(key: string, params?: Record<string, string>): string {
  if (key === 'account') return '账户'
  if (key === 'modelsAvailable') return `可用模型 ${params?.count ?? '0'} 个`
  return key
}

function props(state: Sub2apiStateView, wide = true): Sub2apiSidebarAccountProps {
  return {
    wide,
    actions: { getState: vi.fn(() => Promise.resolve({ ok: true as const, value: state })) },
    subscribe: vi.fn(() => () => {}),
    t: translate,
  } as unknown as Sub2apiSidebarAccountProps
}

describe('Sub2apiSidebarAccount', () => {
  it('stays absent while the Sub2API account is signed out', async () => {
    const view = render(<Sub2apiSidebarAccount {...props(signedOut)} />)
    await waitFor(() => { expect(view.container.querySelector('[data-sub2api-account]')).toBeNull() })
  })

  it('renders the signed-in display name and model count in the wide footer', async () => {
    render(<Sub2apiSidebarAccount {...props({
      status: 'authenticated',
      generation: 1,
      updatedAt: 1,
      account: { userId: 'user-1', email: 'traveler6677@example.test', displayName: '旅行者6677' },
      models: [{
        id: 'model-1',
        endpointFamily: 'chat-completions',
        supportsStreaming: 'verified',
        supportsTools: 'unsupported',
        supportsVision: 'unknown',
        supportsReasoning: 'unknown',
        supportsResponses: 'unsupported',
        source: 'server-metadata',
      }],
    })} />)
    expect(await screen.findByText('旅行者6677')).toBeTruthy()
    expect(screen.getByText('可用模型 1 个')).toBeTruthy()
    expect(screen.getByLabelText('账户: 旅行者6677')).toBeTruthy()
  })

  it('keeps the avatar while the rail is collapsed', async () => {
    render(<Sub2apiSidebarAccount {...props({
      status: 'authenticated',
      generation: 1,
      updatedAt: 1,
      account: { userId: 'user-1', email: 'traveler6677@example.test' },
    }, false)} />)
    await waitFor(() => { expect(screen.getByLabelText('账户: traveler6677')).toBeTruthy() })
    expect(screen.queryByText('traveler6677')).toBeNull()
  })
})
