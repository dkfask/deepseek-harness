---
description: "面向 Host 的 Sub2API 账户、模型网关、Remote、fixture 与生命周期辅助库，提供可选提供方 route 和脱敏投影。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-sub2api

[English](README.md) | 中文

## 概述

本库为 Sub2API 账户集成提供一个明确的 Host 运行时和可选模型 route。调用方可以组合部署 profile、校验 V1 record，通过凭据存储 seam 执行登录、refresh 和 managed API Key reconciliation，生成不含机密的状态，并通过注入的目标校验器发起有界请求。`Sub2apiService` 会通过 `ctx.credentials` 挂载运行时并暴露 `sub2api` Remote namespace；只有显式启用 feature flag 时，才会通过共享的 `llm-pi-ai` 注册动态 `sub2api` route。基于 base 的 profile 会携带同一个默认关闭的 service 行；只有显式部署环境启用它并提供目标事实时才会运行。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 何时使用

当 Host 提供方需要登录、refresh、managed API Key reconciliation、账户/模型/用量刷新和充值 URL 校验，并且必须把账户机密与 UI 可读状态分离时，使用 `Sub2apiRuntimeService`。协议请求使用 `Sub2apiHttpClient`，并传入一个负责校验目标且固定实际连接地址的解析器。标准 codec 面向 fixture：只有在目标部署字段和 envelope 选择得到验证后才组合使用。

### 最小配置

```ts
import { resolveSub2apiProfile, parseSub2apiGrantRecord, redactSub2apiGrantRecord, Sub2apiHttpClient, type Sub2apiDestinationValidator } from '@deepseek-ai/dsh-experimental-sub2api'

const profile = resolveSub2apiProfile({
  version: 'verified-deployment-version',
  accountBaseUrl: 'https://account.example.test/api/v1',
  gatewayBaseUrl: 'https://gateway.example.test',
  accountPaths: { login: '/auth/login', register: '/auth/register', publicSettings: '/settings/public', me: '/auth/me', apiKeys: '/keys', groupsAvailable: '/groups/available' },
  gatewayPaths: { models: '/v1/models', chatCompletions: '/v1/chat/completions' },
})
const record = parseSub2apiGrantRecord(untrustedJson)
const safeState = redactSub2apiGrantRecord(record)

declare const untrustedJson: unknown

declare const resolveAndPinDestination: Sub2apiDestinationValidator
declare const accessToken: { readonly kind: 'access-token'; readonly value: string }

const client = new Sub2apiHttpClient({
  profile,
  maxResponseBytes: 1_000_000,
  timeoutMs: 15_000,
  maxRedirects: 2,
  validateDestination: resolveAndPinDestination,
})
const account = await client.request({ base: 'account', path: '/auth/me', method: 'GET', credential: accessToken })
```

运行时还需要同一个 HTTP client 和凭据存储 adapter。其公共状态只包含账户元数据、缓存时间、模型、用量和稳定错误；`resolveGatewayCredential` 是供 Host-only 模型 provider 获取托管 Key 快照的入口。

只有部署明确允许本地会话恢复时才设置 `persistRefreshToken`。启用后，`hydrate` 会在 Host 启动时刷新与当前部署匹配的已存储 grant；凭据存储只接收 refresh token 和 managed Key，不会接收账户密码或 access token。

配置 `accountPaths.publicSettings` 后，`getPublicSettings` 会在不携带 access token 的情况下读取未认证的部署能力设置，并按显式的 `cacheTtlMs.publicSettings` 时长缓存。配置 `accountPaths.groupsAvailable` 后，`getAvailableGroups` 会读取认证用户可用的命名分组，并按 `cacheTtlMs.groups` 缓存；浏览器使用这些名称选择托管 Key 分组。设置区只有在部署明确报告注册和计费能力已启用时才显示对应控件；没有这些可选 endpoint 的 profile 保留原有的 endpoint 驱动行为。

如果部署挂载了 settings provider，Host 会注册实时的 `sub2api-models` 设置命名空间。模型卡可以为每个已发现模型持久化上下文窗口覆盖值；该值会应用到不含 secret 的模型描述和动态 LLM profile，因此下一次请求会使用配置后的容量，重启后也能保留。runtime 只接受正的安全整数，浏览器额外支持 `K`、`M` 和 `G` 后缀。

Sub2API LLM route 只有在 `toolsEnabled` 为 true，且模型元数据标记为已核验，或模型 id 出现在 `verifiedToolsModels` 中时，才允许工具调用。base profile 通过逗号分隔的 `DSH_SUB2API_VERIFIED_TOOLS_MODELS` 环境变量暴露后者，因此部署可以记录某个模型的真实工具调用探测，而不会把所有未知模型都推断为支持工具。

只有通过 HTTPS 或精确开发 HTTP allowlist、主机安全检查和相对 endpoint path 校验时，profile 才会成功。HTTP client 会添加 JSON 与已验证的认证 header，重新校验同源 redirect，每个响应限制字节数，遵守取消与超时，并在不返回上游错误正文的情况下映射状态失败。record parser 会拒绝不支持或格式错误的持久化值。脱敏投影包含账户元数据与 key 元数据，绝不包含 refresh token 或 API Key secret。创建 managed Key 的 runtime 必须提供正整数 `managedKeyGroupId`；Sub2API 使用这个分组路由网关流量。managed Key reconciliation 会记录选中的 `group_id`，忽略其他分组的同名 key，并在创建响应返回错误分组时拒绝继续。已认证账户所有者可以通过用户侧 `PUT /keys/{id}` endpoint 修改托管 Key 的分组；runtime 会保留仅 Host 可见的 secret、写入新分组，并使模型发现缓存失效，下一次网关请求使用新路由。

Sub2API LLM route 只有在 `toolsEnabled` 为 true，且模型元数据标记为已核验，或模型 id 出现在 `verifiedToolsModels` 中时，才允许工具调用。base profile 通过逗号分隔的 `DSH_SUB2API_VERIFIED_TOOLS_MODELS` 环境变量暴露后者，因此部署可以记录某个模型的真实工具调用探测，而不会把所有未知模型都推断为支持工具。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包把协议选择、持久化 record 解析、secret 标记、状态流转、代数保护和 Host 运行时拆成独立模块。这样 Host 组合可以拥有传输、存储、生命周期、缓存和 key 管理，而不会把兼容性 profile 变成隐藏默认值。

| 文件 | 职责 |
|---|---|
| [`src/profile.ts`](src/profile.ts) | 规范化部署 URL 与 endpoint path，选择 envelope/auth，并拒绝不安全的 URL 形式 |
| [`src/http.ts`](src/http.ts) | 构造有界认证请求、校验 redirect、限制响应体，并映射传输与状态失败 |
| [`src/protocol.ts`](src/protocol.ts) | 解析有界 JSON，并选择配置的 direct 或 `data` 响应 envelope |
| [`src/record.ts`](src/record.ts) | 解析 V1 grant、标记 secret 值，并生成不含 secret 的投影 |
| [`src/state.ts`](src/state.ts) | 应用允许的账户生命周期事件，并跟踪单调递增的操作代数 |
| [`src/service.ts`](src/service.ts) | 负责 Host 登录、refresh、账户/模型/用量缓存、managed Key reconciliation 和充值 URL 校验 |
| [`src/cordis.ts`](src/cordis.ts) | 使用已安装的凭据 provider 将 runtime 挂载为 `ctx.sub2api` |
| [`src/llm.ts`](src/llm.ts) | 在共享 `llm-pi-ai` Chat Completions/SSE 适配器之上注册可选的 `sub2api` route |
| [`src/remote.ts`](src/remote.ts) | 通过不含 secret 的 Typert Remote namespace 投影账户动作与状态 |
| [`src/compatibility.ts`](src/compatibility.ts) | 解析锁定基线、目标部署和 fixture 证据矩阵及脱敏目标观察记录 |
| [`src/fixtures.ts`](src/fixtures.ts) | 解析并重放版本化业务 fixture，再提供用于协议和竞态测试的确定性 fetch 与凭据存储 double |
| [`src/errors.ts`](src/errors.ts) | 定义稳定的 Sub2API 错误分类和脱敏错误摘要 |
| [`src/types.ts`](src/types.ts) | 将 wire-safe 与持久化类型声明和运行时代码分离 |
| [`tests/fixtures/account-v1.json`](tests/fixtures/account-v1.json) | 用于 Host runtime 重放路径的合成请求断言与响应 |
| [`tests/fixtures/gateway-v1.json`](tests/fixtures/gateway-v1.json) | 合成模型列表、非流式 Chat Completions、SSE 与用量交换 |
| [`tests/fixtures/compatibility-matrix-v1.json`](tests/fixtures/compatibility-matrix-v1.json) | P0/P1 证据行，分离目标部署证据与合成 fixture 状态 |
| [`tests/fixtures/target-local-0.2.5-v1.json`](tests/fixtures/target-local-0.2.5-v1.json) | 本地目标的脱敏观察记录，只保存路径、状态码、字段名、数量和流终止结果，不保存 secret |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Sub2API 用户账户与模型网关需求模型](../../../需求模型.md)——范围、状态规则、兼容性矩阵和延期的提供方工作。
- [Sub2API 计划书](../../../2026-09-16-sub2api-user-account-model-gateway.zh.revised.md)——用户提供的计划书；其中的实现说明不会扩大用户授权。
- [凭据 seam](../../credentials/credentials/README.zh.md)——后续持久化机密值的拥有者。
- [LLM 适配器](../../llm/llm-pi-ai/README.zh.md)——共享的 OpenAI 兼容请求与 SSE 实现。
- [Remote gateway](../../api/remotes/README.zh.md)——设置页使用的 Host/Client 传输。
- [Sub2API 设置区](../../client/ui-settings-sub2api/README.zh.md)——账户、用量、模型与充值控件的浏览器投影。

-----

<a id="model-experience"></a>
## 模型体验

间接影响。可选的 Sub2API provider 委托 `dsh-llm-pi-ai` 负责请求构造。

#### KV Cache effect

route 元数据根据当前不含 secret 的模型目录解析；请求缓存与 token 统计仍由 `dsh-llm-pi-ai` 负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **目标证据仍不完整**——本地 Sub2API 0.2.5 容器已经使用已分配分组的 managed Key，通过账户登录、refresh、当前用户、用量面板、模型发现、非流式 Chat Completions，以及连接确定性 OpenAI 兼容上游的流式 SSE。匹配的 12 个 P0 行已记录为 `verified`；没有完整独立基线与目标协议证据的行仍保持 `not-provided`。
- **组合提供部署事实**——共享 base 行可以根据显式 `httpOptions` 创建仅限 loopback 的开发传输；生产 hostname 必须由注入的 resolver 和固定传输提供。凭据 provider 仍由选定的 desktop、web、headless 或 CLI 组合提供。
- **能力继续 fail-closed**——模型的 streaming、容量和其他能力必须有明确证据；没有所需独立证据时，tools 和 Responses 保持关闭。
- **Tools 是显式部署开关**——只有在独立 fixture 验证目标模型的请求与工具调用响应后，才可设置 `DSH_SUB2API_TOOLS_ENABLED=true`。共享 base 默认关闭该开关；经过验证的 ThunderUni 部署可以同时设置以逗号分隔的 `DSH_SUB2API_VERIFIED_TOOLS_MODELS` 白名单，未列入白名单的未知模型仍会被阻止。
- **充值是经校验的跳转**——设置区只能打开通过 scheme、origin 和 redirect 策略的服务端或配置 URL。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文</summary>

在相关 P0 问题由真实目标部署关闭前，本包保持实验状态。当前代码提供 Host runtime、共享 provider route、Remote/UI 投影和可重放 fixture；合成 fixture 不证明某个 Sub2API 部署可访问或兼容。

</details>

不发布 runtime invariant companion，因为协议解析、脱敏投影和状态转换由本包测试直接检查；其余生命周期关系由 Cordis、Remote、凭据和 provider registry 所有。
