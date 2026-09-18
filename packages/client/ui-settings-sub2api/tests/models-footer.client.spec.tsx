// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Sub2apiStateView } from '@deepseek-ai/dsh-api-remotes/client'
import type { Sub2apiModelsFooterProps } from '../src/client/Sub2apiModelsFooter.tsx'
import { Sub2apiModelsFooter } from '../src/client/Sub2apiModelsFooter.tsx'

afterEach(cleanup)

const state: Sub2apiStateView = {
  status: 'authenticated',
  generation: 1,
  updatedAt: 1,
  account: { userId: 'user-1', email: 'traveler6677@example.test' },
  apiKey: { id: 'key-1', name: 'thunderuni-managed', active: true, groupId: 5, fingerprint: 'fp-1' },
  models: [{
    id: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    endpointFamily: 'chat-completions',
    supportsStreaming: 'verified',
    supportsTools: 'unsupported',
    supportsVision: 'unknown',
    supportsReasoning: 'unknown',
    supportsResponses: 'unsupported',
    source: 'server-metadata',
  }],
}

const groups = [
  { id: 5, name: '默认分组' },
  { id: 9, name: 'ThunderUni 编程' },
] as const

function props(
  snapshot: Sub2apiStateView = state,
  refreshModels = vi.fn(() => Promise.resolve({ ok: true as const, value: snapshot.models ?? [] })),
  updateManagedKeyGroup = vi.fn(() => Promise.resolve({ ok: true as const, value: snapshot })),
  updateModelSettings = vi.fn(() => Promise.resolve({ ok: true as const, value: snapshot })),
): Sub2apiModelsFooterProps {
  const t = (key: string) => ({
    providerName: 'ThunderUni',
    providerRoute: 'Sub2API',
    providerConnected: '已连接',
    keyName: 'Key 名称',
    group: '分组',
    groupInputLabel: '分组',
    selectGroup: '选择分组',
    loadingGroups: '正在加载分组…',
    groupsUnavailable: '无法读取可用分组。',
    groupUnavailable: '请选择一个可用分组。',
    editGroup: '修改分组',
    saveGroup: '保存分组',
    cancel: '取消',
    groupUpdateFailed: '分组修改失败。',
    updatingGroup: '保存中…',
    modelContextWindow: '上下文窗口',
    modelContextPlaceholder: '例如 128K',
    saveModelContext: '保存上下文窗口',
    savingModelContext: '正在保存上下文窗口…',
    modelContextInvalid: '请输入正整数，也可以使用 K、M 或 G 后缀。',
    modelContextUpdateFailed: '模型上下文窗口修改失败。',
    keySecretHidden: '密钥值已隐藏',
    managedKey: '托管 API Key',
    discoveredModels: '可用模型',
  }[key] ?? key)
  return {
    provider: { provider: 'sub2api', displayName: 'ThunderUni', settingsNs: '', settingsPath: [], active: true },
    actions: {
      getState: vi.fn(() => Promise.resolve({ ok: true as const, value: snapshot })),
      refreshModels,
      getAvailableGroups: vi.fn(() => Promise.resolve({ ok: true as const, value: groups })),
      updateManagedKeyGroup,
      updateModelSettings,
    },
    subscribe: vi.fn(() => () => {}),
    t,
  } as unknown as Sub2apiModelsFooterProps
}

describe('Sub2apiModelsFooter', () => {
  it('shows the account key metadata, group, and discovered models without the secret', async () => {
    render(<Sub2apiModelsFooter {...props()} />)

    expect(await screen.findByText('ThunderUni')).toBeTruthy()
    expect(screen.getByText('thunderuni-managed')).toBeTruthy()
    expect(screen.getByText('默认分组')).toBeTruthy()
    expect(screen.getByText('DeepSeek Chat')).toBeTruthy()
    expect(screen.queryByText('fixture-api-key')).toBeNull()
  })

  it('refreshes the backend model catalog when the authenticated state has not loaded it', async () => {
    const refreshModels = vi.fn(() => Promise.resolve({ ok: true as const, value: state.models ?? [] }))
    const { models: _models, ...withoutModels } = state
    const snapshot: Sub2apiStateView = withoutModels
    render(<Sub2apiModelsFooter {...props(snapshot, refreshModels)} />)

    expect(await screen.findByText('DeepSeek Chat')).toBeTruthy()
    expect(refreshModels).toHaveBeenCalledOnce()
  })

  it('updates the managed key group from the model settings card', async () => {
    const updated = { ...state, apiKey: { ...state.apiKey!, groupId: 9 } }
    const updateManagedKeyGroup = vi.fn(() => Promise.resolve({ ok: true as const, value: updated }))
    render(<Sub2apiModelsFooter {...props(state, undefined, updateManagedKeyGroup)} />)

    fireEvent.click(await screen.findByRole('button', { name: '修改分组' }))
    fireEvent.change(screen.getByRole('combobox', { name: '分组' }), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: '保存分组' }))

    expect(updateManagedKeyGroup).toHaveBeenCalledWith(9)
    expect(await screen.findByText('ThunderUni 编程')).toBeTruthy()
  })

  it('saves the model context window and accepts a K suffix', async () => {
    const updated: Sub2apiStateView = { ...state, models: [{ ...state.models![0]!, contextWindow: 131072, source: 'configured' as const }] }
    const updateModelSettings = vi.fn(() => Promise.resolve({ ok: true as const, value: updated }))
    render(<Sub2apiModelsFooter {...props(state, undefined, undefined, updateModelSettings)} />)

    fireEvent.change(await screen.findByRole('textbox', { name: '上下文窗口 DeepSeek Chat' }), { target: { value: '128K' } })
    fireEvent.click(screen.getByRole('button', { name: '保存上下文窗口' }))

    expect(updateModelSettings).toHaveBeenCalledWith({ modelId: 'deepseek-chat', contextWindow: 128000 })
    expect(await screen.findByText('DeepSeek Chat')).toBeTruthy()
  })
})
