# Agent Note: Sub2API 用户账户与模型网关集成

Status: proposed (revised)

基线：`881f3202694c6bc932446931a30c27d9675178b9`

> 本文档定义 Harness 与 Sub2API 的第一方账户、凭据、模型网关、Remote/UI、安全、测试和发布契约。所有兼容性结论必须以锁定的 Sub2API 基线和实际部署实例为准；对 Sub2API 当前 `main` 分支的观察只能作为能力参考，不得直接替代 fixture 验证。

---

## 1. 背景与问题

Harness 需要提供一条第一方账户路径，使用户能够：

1. 注册或登录 Sub2API；
2. 在 Harness 内建立与 Sub2API 用户身份分离且可撤销的账户会话；
3. 使用由 Harness 管理的 Sub2API 用户 API Key 发送模型请求；
4. 动态获取 Sub2API 对当前用户/API Key 暴露的模型；
5. 查看 Sub2API 持有的账户余额、用量和服务状态；
6. 在余额不足时进入明确、可恢复的充值流程；
7. 在 desktop、web、headless 和 CLI 中共享同一套账户服务和模型路由实现。

Harness 已经分别拥有匿名遥测身份、浏览器认证、凭据存储、LLM 适配器、Remote 控制器、settings slot 和 open-url 等能力，但尚没有一种第一方能力能在不暴露上游密钥、不修改 agent loop、不复制 OpenAI 兼容流式逻辑的前提下连接这些关注点。

---

## 2. 目标

V1 的目标是建立一条可审计、可测试、可回滚的 Sub2API 用户账户与模型网关路径：

- 账户认证由 Host 管理，浏览器仅获得脱敏状态；
- access token 仅驻留进程内存；
- refresh token（如果部署正式提供）仅进入凭据存储；
- 用户模型 API Key 由 Harness 托管，但不进入设置、Remote、日志或会话事件；
- 模型请求继续复用 `llm-pi-ai` 现有 OpenAI 兼容实现；
- 模型能力采用“默认保守、fixture 验证后开放”的策略；
- 支付第一版只跳转到已核验充值页面，不在 Harness 内实现支付账本或 webhook；
- 所有账户和模型状态变化都具备稳定状态机、错误语义和并发规则。

---

## 3. 非目标

V1 明确不做：

- Sub2API Admin API；
- Admin API Key；
- Harness 自有支付订单、支付签名、webhook 验签或账本；
- 自动管理 Sub2API 上游账号池；
- 根据模型名称猜测 tools、vision、reasoning、Responses 等能力；
- 在客户端设置、环境变量、Remote 事件或浏览器存储中暴露托管 API Key；
- 将 Sub2API 登录身份作为任意 Host RPC 的授权依据；
- 在没有真实协议 fixture 的情况下启用 Responses；
- 第一版默认支持多 Sub2API 部署或多账户同时激活。

---

## 4. 兼容性契约与核验产物

### 4.1 基本原则

锁定提交 `881f3202694c6bc932446931a30c27d9675178b9` 是实现基线。任何接口、字段、状态码、认证方式、刷新语义、API Key 返回方式、模型发现或 SSE 行为，都必须针对：

1. 锁定基线源码；
2. 目标实际部署；
3. recorded fixture / protocol fixture；

三者重新核验。

当前 Sub2API `main` 分支已出现 refresh token、token 过期时间、TOTP、OAuth、用户 API Key CRUD 等能力，但这些只能用于判断“可能存在的能力”，不能用于证明基线或目标部署一定兼容。

### 4.2 Compatibility Matrix

在阶段 A 开始编码前，必须创建并持续维护如下兼容性矩阵：

| 能力 | 锁定基线 | 目标部署 | Harness V1 策略 | Fixture 状态 |
|---|---|---|---|---|
| 注册 | 待核验 | 待核验 | 必须支持 | required |
| 登录 | 待核验 | 待核验 | 必须支持 | required |
| 当前用户 | 待核验 | 待核验 | 必须支持 | required |
| access token | 待核验 | 待核验 | 必须支持 | required |
| refresh token | 待核验 | 待核验 | 有正式接口才启用 | required if present |
| token `expires_in`/`expires_at` | 待核验 | 待核验 | 有则使用 | required if present |
| TOTP 2FA | 待核验 | 待核验 | 明确支持或显式拒绝 | required if present |
| 用户 API Key 列表 | 待核验 | 待核验 | 必须支持或采用确定性创建策略 | required |
| 用户 API Key 创建 | 待核验 | 待核验 | 必须支持 | required |
| 用户 API Key 删除/禁用 | 待核验 | 待核验 | V1 可选 | optional |
| `/v1/models` | 待核验 | 待核验 | 必须支持模型发现 | required |
| Chat Completions 非流式 | 待核验 | 待核验 | 必须支持 | required |
| Chat Completions SSE | 待核验 | 待核验 | 必须支持 | required |
| Tools | 待核验 | 待核验 | fixture 证明后启用 | required for tools |
| Usage | 待核验 | 待核验 | 必须支持展示 | required |
| Balance | 待核验 | 待核验 | 必须支持展示/402 恢复 | required |
| Recharge URL | 待核验 | 待核验 | 已配置且已核验才开放 | required if enabled |
| Responses | 待核验 | 待核验 | 默认禁用 | required before enable |

### 4.3 接口版本化

实现不得把未核验路径硬编码为“永远正确”的公共契约。建议内部定义：

```ts
interface Sub2apiProtocolProfile {
  version: 1
  accountApiBase: string
  gatewayApiBase: string
  endpoints: {
    register: string
    login: string
    login2FA?: string
    refresh?: string
    me: string
    listKeys?: string
    createKey: string
    models: string
    usage: string
  }
  responseEnvelope: 'direct' | 'data' | 'both'
  auth: {
    user: 'bearer-jwt'
    gateway: 'bearer-api-key' | 'x-api-key' | 'verified-other'
  }
}
```

V1 可以只内置一个经过验证的 profile，但测试必须证明当协议不匹配时 fail closed，而不是静默猜测。

---

## 5. 总体架构

新增独立 `sub2api` capability，由以下部分组成：

1. **Host Service Provider**：账户、凭据、模型、用量、充值 URL、错误映射和缓存的唯一所有者；
2. **Sub2API HTTP Client**：集中实现用户 API 和模型发现 HTTP 请求；
3. **Credential Record**：保存部署绑定、账户摘要、refresh token（如有）和托管 API Key；
4. **Runtime Session**：仅内存保存 access token、session generation 和当前状态；
5. **Remote Namespace**：只输出脱敏账户/模型/用量状态与动作；
6. **`llm-pi-ai` Reserved Provider**：使用 Host 运行时解析器获取 API Key 快照；
7. **Settings UI**：注册、登录、2FA（若支持）、退出、余额、用量、模型刷新、充值；
8. **Observability**：只记录非敏感事件、状态和耗时；
9. **Compatibility Fixtures**：证明协议、SSE、tools、usage 和错误行为。

账户会话与 conversation `SessionId`、匿名遥测身份和浏览器认证 cookie 完全分离。

---

## 6. 凭据模型

### 6.1 GrantRecord

在 `credentialKey('sub2api', 'user-session')` 保存带版本记录。建议 V1 schema：

```ts
interface Sub2apiGrantRecordV1 {
  version: 1

  deployment: {
    origin: string
    fingerprint: string
  }

  account: {
    userId: string
    email?: string
    displayName?: string
  }

  auth: {
    refreshToken?: Secret
    refreshTokenType?: string
    lastRefreshAt?: number
  }

  apiKey: {
    id?: string
    name: string
    secret: Secret
    fingerprint?: string
    createdAt?: number
  }

  generation: number
  updatedAt: number
}
```

### 6.2 存储规则

- 密码：绝不持久化；
- access token：仅进程内存；
- refresh token：仅在目标部署正式提供并通过 fixture 后写入 credential provider；
- API Key secret：仅 credential provider；
- API Key id/name/fingerprint：可以作为非明文元数据持久化；
- `deployment.origin` 必须与凭据绑定；
- 配置 base URL 改变后，旧凭据不得自动发送给新 origin；
- 记录只能通过 `ctx.credentials.modifyRecord` 原子轮换/替换；
- 读取后在持久化边界再次校验 schema version 和 deployment fingerprint；
- diagnostic、snapshot、Remote、settings serialization 中必须统一脱敏。

### 6.3 单部署/单账户约束

V1 明确支持：

> 每个 Harness profile 同一时间恰好一个 active Sub2API deployment + 一个 active Sub2API user account。

未来若支持多部署，迁移目标为：

```text
sub2api/<deployment-id>/<account-id>
```

但 V1 不提前引入多账户 UI。

---

## 7. 认证状态机

### 7.1 状态

```text
SIGNED_OUT
  -> AUTHENTICATING
  -> AUTHENTICATED

AUTHENTICATED
  -> REFRESHING
  -> AUTHENTICATED
  -> REAUTH_REQUIRED

AUTHENTICATED
  -> KEY_REQUIRED
  -> AUTHENTICATED

AUTHENTICATED
  -> INSUFFICIENT_BALANCE
  -> AUTHENTICATED

任意状态
  -> SIGNING_OUT
  -> SIGNED_OUT
```

建议内部枚举：

```ts
type Sub2apiAuthState =
  | 'signed-out'
  | 'authenticating'
  | 'two-factor-required'
  | 'authenticated'
  | 'refreshing'
  | 'reauth-required'
  | 'key-required'
  | 'insufficient-balance'
  | 'signing-out'
```

### 7.2 登录

- 使用经过验证的 `email/password` 或基线要求的登录字段；
- 登录成功后立即读取 `/me` 或等价接口，确认 token 与账户一致；
- 未完成账户确认前不得 provision API Key；
- TOTP 部署若返回“二次验证需要”状态，则进入 `two-factor-required`；
- 若 V1 不实现 TOTP，必须返回稳定的 `SUB2API_2FA_UNSUPPORTED`，不能折叠成普通登录失败。

### 7.3 Refresh Token 策略

只有 compatibility fixture 证明目标部署提供正式 refresh token 时启用。

```text
access_token:
  memory only

refresh_token:
  credential provider only

refresh trigger:
  expires_at - 120s（如果有可靠过期时间）
  或 401 后最多一次被动刷新
```

规则：

- 同一账户同时最多一个 refresh 请求（singleflight）；
- 等待中的请求共享同一 refresh 结果；
- 单个业务请求最多触发一次 refresh + replay；
- refresh 返回 401/403/invalid_grant 等不可恢复错误后进入 `REAUTH_REQUIRED`；
- 不允许 `401 -> refresh -> replay -> 401 -> refresh` 循环；
- refresh 成功后原子更新 runtime token，并在服务端轮换 refresh token 时更新 GrantRecord；
- refresh 和 logout 竞争时 logout 获胜。

### 7.4 Session Generation

每次成功登录、凭据替换、deployment 改变或 logout 都推进 `sessionGeneration`。

每个异步请求在发出前捕获 generation：

```ts
const generation = session.generation
```

响应提交前必须检查：

```ts
if (generation !== session.generation) discardResult()
```

旧 generation 的 `/me`、模型列表、用量、API Key provision 和 refresh 结果都不得覆盖新状态。

---

## 8. API Key 生命周期

### 8.1 托管 Key 标识

V1 不随机复用用户已有 API Key。Harness 只管理自己的 key。

建议命名：

```text
harness:<installation-id>
```

如果不允许暴露 installation id，则使用稳定哈希：

```text
harness:<installation-fingerprint>
```

### 8.2 确定性解析算法

登录完成后：

1. 如果 GrantRecord 有 `apiKey.id`，优先查询该 id；
2. 若该 key 存在、属于当前用户、状态有效，则继续使用；
3. 如果 id 不存在但支持 list，查找 exact managed key name；
4. 仅有一条精确匹配且有效时复用；
5. 多条同名时 fail closed，不猜测；
6. 没有托管 key 时创建新 key；
7. 不自动复用任何用户手工创建的普通 key；
8. 新 key 创建后立即把 id/name/secret/fingerprint 原子写入 GrantRecord；
9. 如果 key secret 只在创建响应中出现，必须在响应返回后、任何后续网络请求前完成持久化或安全失败。

### 8.3 Logout 与 Revoke 分离

`logout` 的 V1 语义：

- 使 access token 失效/丢弃；
- 删除本地 refresh token；
- 删除本地 API Key secret；
- 清除账户、模型、用量缓存；
- 推进 generation；
- **不默认删除 Sub2API 服务端 managed key**。

未来可以增加显式动作：

```text
“退出并撤销此设备 API Key”
```

该动作才调用服务端 delete/disable 接口。

### 8.4 API Key 失效

模型请求遇到经过核验的“key invalid/revoked”错误时：

- 不直接创建无限数量新 key；
- 将状态转为 `KEY_REQUIRED`；
- 最多执行一次 key reconciliation；
- 若仍失败，要求用户刷新账户或重新登录；
- 记录非敏感错误事件。

---

## 9. HTTP、URL 与 SSRF 安全模型

### 9.1 协议规则

生产环境：

- 只允许 `https`；
- 禁止凭据通过明文 HTTP 发送。

开发环境：

- 仅在显式 `insecureDevMode=true` 时允许 HTTP；
- 仅允许明确 allowlist（例如 localhost 或开发容器网络）；
- 开发例外不能自动继承到生产配置。

### 9.2 URL 校验

每个服务端请求：

- 只接受 `http/https` scheme；生产仅 `https`；
- 禁止 URL userinfo（`https://user:pass@host`）；
- 拒绝未指定、环回、链路本地、私有、组播、保留地址；
- IPv4、IPv6、IPv4-mapped IPv6 必须规范化后检查；
- 连接前解析 DNS 并校验所有地址；
- 连接建立后校验实际 peer IP；
- 禁止 DNS rebinding 将连接落入禁止网段；
- 每个 redirect 目标重新走完整策略；
- 最大重定向次数固定（建议 3）；
- 禁止 HTTPS -> HTTP downgrade redirect；
- 明确代理模型：默认不自动信任系统代理环境变量；如需代理，必须单独设计凭据和目标验证策略。

至少覆盖：

```text
127.0.0.0/8
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
::1
fc00::/7
fe80::/10
IPv4-mapped aliases
保留/未指定/组播地址
```

### 9.3 HTTP Client 基线

- 请求支持 AbortSignal/cancellation；
- 登录/注册/refresh 和普通 GET 使用不同 timeout profile；
- 限制响应头和响应体大小；
- JSON 解析失败映射为稳定错误；
- 不记录 Authorization、Cookie、API Key header、密码或完整认证响应；
- 不把 JWT/API Key 放入 URL/query；
- 仅充值 URL 可以交给 open-url，并且必须符合单独 allowlist 策略。

---

## 10. 错误模型与重试矩阵

### 10.1 稳定产品错误

建议至少定义：

```ts
type Sub2apiErrorCode =
  | 'SUB2API_NOT_AUTHENTICATED'
  | 'SUB2API_REAUTH_REQUIRED'
  | 'SUB2API_2FA_REQUIRED'
  | 'SUB2API_2FA_UNSUPPORTED'
  | 'SUB2API_KEY_REQUIRED'
  | 'SUB2API_KEY_INVALID'
  | 'SUB2API_INSUFFICIENT_BALANCE'
  | 'SUB2API_ACCOUNT_UNAVAILABLE'
  | 'SUB2API_MODEL_UNAVAILABLE'
  | 'SUB2API_RATE_LIMITED'
  | 'SUB2API_TIMEOUT'
  | 'SUB2API_BAD_REQUEST'
  | 'SUB2API_BAD_RESPONSE'
  | 'SUB2API_SERVICE_UNAVAILABLE'
  | 'SUB2API_PROTOCOL_MISMATCH'
  | 'SUB2API_RECHARGE_UNAVAILABLE'
```

### 10.2 重试矩阵

| 操作/错误 | 自动重试 |
|---|---|
| Login POST | 否 |
| Register POST | 否 |
| TOTP submit | 否 |
| Refresh | 网络/5xx 最多按受控策略重试；认证失败不重试 |
| Create Key POST | 默认否，除非服务端具备幂等键并已验证 |
| GET `/me` | 网络/5xx 最多 1 次 |
| GET models | 5xx/网络错误最多 2 次，指数退避 |
| GET usage/balance | 网络/5xx 最多 1 次 |
| LLM 401 | 最多一次 refresh + replay |
| LLM 402 | 不重试，进入余额恢复 |
| LLM 403 | 不进入 refresh loop；按协议区分权限/key/account |
| LLM 429 | 遵循 `Retry-After`，由 provider 策略控制 |
| LLM timeout（尚未输出） | 复用 provider 现有策略 |
| SSE 已输出 token 后断流 | **不得自动整体重放** |
| 5xx（尚未输出） | 复用 provider 现有重试策略 |

401 会使当前 access token 失效；如果存在正式 refresh，则最多执行一次 refresh。没有 refresh 能力时直接进入 `REAUTH_REQUIRED`。

---

## 11. 模型发现与能力模型

### 11.1 Reserved Provider

为 `llm-pi-ai` 增加仅供 Host 使用的保留 provider，例如：

```text
provider id = sub2api
```

要求：

- provider id 为 Harness 保留；
- 用户配置不能静默覆盖；
- 注册与替换必须原子；
- 如果存在同名用户 provider，给出稳定冲突错误或明确迁移行为；
- API Key 只能通过 Host runtime resolver 获取；
- 不使用 `apiKeyEnv`、设置文档、环境变量或 Remote 传递托管 key。

### 11.2 API Key Resolver

发送前：

1. 捕获当前 authenticated session generation；
2. 检查账户状态；
3. 获取 managed key secret 的只读快照；
4. 检查 deployment fingerprint；
5. 在任何网络活动前发现未认证/失配并失败；
6. 请求结束后不保留额外明文副本。

### 11.3 模型列表不代表完整能力

`/v1/models` 只作为“模型发现来源”，不能单独证明：

- 模型一定可路由；
- tools 可用；
- vision 可用；
- reasoning 可用；
- Responses 可用；
- context window/max output；
- 特定 streaming 事件格式。

模型描述建议：

```ts
interface Sub2apiModelDescriptor {
  id: string
  displayName?: string
  endpointFamily: 'chat-completions' | 'responses' | 'unknown'

  supportsStreaming: 'verified' | 'unknown'
  supportsTools: 'verified' | 'unsupported' | 'unknown'
  supportsVision: 'verified' | 'unsupported' | 'unknown'
  supportsReasoning: 'verified' | 'unsupported' | 'unknown'
  supportsResponses: 'verified' | 'unsupported' | 'unknown'

  contextWindow?: number
  maxOutputTokens?: number
  source: 'fixture' | 'server-metadata' | 'configured' | 'unknown'
}
```

未验证能力必须使用 `unknown`，不得根据模型 id/name 猜测。

### 11.4 Chat Completions

阶段 B 复用 pi-ai 现有：

- OpenAI compatible request transform；
- 非流式 response；
- SSE frame assembly；
- usage；
- tool call lifecycle；
- timeout watchdog；
- attribution headers；
- provider retry policy。

禁止为了 Sub2API 复制一套新的 OpenAI adapter。

### 11.5 Responses

默认禁用。只有真实 fixture 同时证明：

- request schema；
- stream event sequence；
- text delta；
- tool call + tool result；
- usage；
- completion/termination；
- cancellation；
- error envelope；
- retry boundary；

才允许通过 feature flag 启用。

---

## 12. 缓存与并发

### 12.1 建议 TTL

| 数据 | TTL | 强制失效条件 |
|---|---:|---|
| `/me`/账户摘要 | 30–60s | login/logout/refresh/deployment change |
| models | 5 min | login/logout/manual refresh/key change/deployment change |
| usage/balance | 30s | login/logout/402/recharge return/manual refresh |
| API Key metadata | session scoped | key reconcile/logout/deployment change |

TTL 是默认值，最终以产品体验和服务端负载为准。

### 12.2 Singleflight

以下操作必须 singleflight：

- token refresh；
- managed API Key reconciliation；
- models refresh；
- account refresh；

并发 100 个调用者不应产生 100 个等价上游请求。

### 12.3 Stale 数据

账户/余额 UI 返回：

```ts
interface AccountSnapshot {
  balance?: number
  currency?: string
  usage?: unknown
  asOf: number
  stale: boolean
}
```

UI 必须能够区分“最后确认值”和“实时保证值”。

---

## 13. Remote 契约

增加 `sub2api` Remote namespace。

允许动作：

- `getState`
- `register`
- `login`
- `submit2FA`（仅当支持）
- `logout`
- `refreshAccount`
- `getUsage`
- `refreshModels`
- `getRechargeUrl`

Remote 输出只包含：

- auth state；
- 脱敏 user id/email/displayName；
- balance/usage/asOf/stale；
- 模型 descriptor 的非敏感字段；
- loading/error/recovery action；
- 是否需要 2FA/重新登录/充值。

Remote 永不输出：

- access token；
- refresh token；
- API Key secret；
- Authorization header；
- 原始认证响应；
- Admin key；
- 完整上游 response body；
- password。

只转发浏览器需要的非敏感账户、模型、用量失效事件。

---

## 14. 交互式授权与 Headless/CLI

组合提供交互通道时，使用 `ctx.authorization` 承载登录、注册和 2FA 流程。

要求：

- 每个流程支持取消；
- 认证尝试之间不会把密码持久化；
- headless/CLI 在没有交互能力时快速返回可执行的错误：

```text
SUB2API_LOGIN_REQUIRED
SUB2API_2FA_REQUIRED
```

不得伪装成可以弹出 UI。

---

## 15. Settings UI

通过现有 `settings.section` slot 增加账户区。

### 15.1 状态

至少覆盖：

- 未登录；
- 登录中；
- 需要 2FA；
- 已登录；
- token 正在刷新；
- 需要重新登录；
- API Key 恢复中；
- 模型加载；
- 余额不足；
- 服务不可用；
- 充值跳转不可用。

### 15.2 功能

- 注册；
- 登录；
- 2FA 输入（若启用）；
- 退出；
- 脱敏账户信息；
- 余额；
- 用量；
- 最近更新时间；
- 模型刷新；
- 充值按钮；
- 账户/模型状态刷新。

### 15.3 充值

只有目标部署配置的 recharge URL 通过协议/主机策略才显示按钮。

从充值页面返回时：

1. 不相信浏览器 query/callback 传入的余额；
2. 重新请求 `/me`/balance/usage；
3. 重新刷新模型状态；
4. 如果服务端仍返回 402，则继续保持余额不足状态。

---

## 16. 本地化

功能自有英文和简体中文 locale dictionary。

至少覆盖：

- 表单校验；
- 登录/注册；
- 2FA；
- token 过期；
- 重新登录；
- API Key 无效；
- 余额不足；
- 限流；
- 模型不可用；
- 服务不可用；
- 协议不兼容；
- 充值跳转失败；
- 当前数据可能过期。

settings shell 不做结构性修改。

---

## 17. 可观测性与诊断

### 17.1 允许记录

建议事件：

```text
sub2api.auth.login.success
sub2api.auth.login.failure
sub2api.auth.refresh.success
sub2api.auth.refresh.failure
sub2api.auth.reauth_required
sub2api.key.resolve.success
sub2api.key.resolve.failure
sub2api.models.refresh.success
sub2api.models.refresh.failure
sub2api.usage.refresh.success
sub2api.usage.refresh.failure
sub2api.llm.error.401
sub2api.llm.error.402
sub2api.llm.error.403
sub2api.llm.error.429
sub2api.llm.error.5xx
sub2api.remote.error
```

可记录字段：

- hashed deployment host；
- hashed account id；
- request id；
- status class；
- stable error code；
- duration_ms；
- retry count；
- session generation（非 secret）；
- cache hit/miss。

### 17.2 禁止记录

- password；
- access token；
- refresh token；
- API Key；
- Authorization/Cookie；
- 完整 prompt；
- 完整模型响应；
- 完整认证原始响应；
- 充值 URL 中可能出现的敏感 query。

### 17.3 Secret Leakage Tests

必须通过自动测试断言 secrets 不进入：

- logs；
- snapshots；
- Remote payload；
- settings serialization；
- crash diagnostic；
- recorded sessions；
- URL；
- analytics events。

---

## 18. 发布、Feature Flag 与回滚

引入：

```text
sub2apiIntegration = false
sub2apiResponses = false
```

发布顺序：

1. Developer only；
2. Internal dogfood；
3. Opt-in beta；
4. 默认启用（满足验收后）；
5. Responses 单独灰度。

回滚要求：

- 关闭 feature flag 不删除 GrantRecord；
- 不破坏其他 provider；
- 不自动改变用户默认模型；
- 不需要数据库迁移回滚即可停止使用 Sub2API；
- 再次启用时必须重新验证 deployment fingerprint 和 session 状态。

---

## 19. 分阶段实施计划

### 阶段 A：账户与协议基础

交付：

- `sub2api` capability；
- Compatibility Matrix；
- protocol profile；
- GrantRecord V1；
- 登录/注册；
- `/me`；
- refresh token 生命周期（仅在已验证时）；
- 2FA 状态识别；
- managed API Key lifecycle；
- direct / `{ data: ... }` envelope 解析；
- stable error model；
- URL/SSRF policy；
- account/session state machine；
- generation 并发保护；
- HTTP fixtures。

不包含：

- settings UI；
- recharge jump；
- Responses。

### 阶段 B：模型网关

交付：

- Reserved `sub2api` provider；
- runtime API Key resolver；
- dynamic models；
- ModelDescriptor；
- Chat Completions 非流式；
- SSE；
- tools（fixture 验证后）；
- usage preservation；
- provider retry semantics；
- 401/402/403/429/timeout/5xx 映射；
- desktop/web/headless/CLI 共享组合；
- model/cache singleflight。

### 阶段 C：账户 UI 与充值

交付：

- settings account section；
- register/login/logout；
- 2FA UI（如果 V1 支持）；
- account/balance/usage；
- `asOf/stale`；
- model refresh；
- recharge URL validation/open；
- recharge return refresh；
- EN/zh-CN localization；
- browser persistence/Remote tests；
- observability events。

### 阶段 D：Responses（条件启用）

只有协议 fixture 证明完整行为后交付：

- Responses request；
- SSE event mapping；
- tools；
- usage；
- termination；
- cancellation；
- error mapping；
- feature flag rollout。

未来支付 facade 仍只存在服务端，并且不属于 V1。

---

## 20. 测试矩阵

### 20.1 认证

- 注册成功/失败；
- 登录成功/密码错误；
- 登录返回 direct envelope；
- 登录返回 `{ data }` envelope；
- TOTP required；
- TOTP unsupported；
- refresh 成功；
- refresh token rotation；
- refresh 401；
- access token 401 -> refresh -> replay；
- 第二次 401 不再次 refresh；
- logout during refresh；
- login/logout race；
- stale generation response 丢弃。

### 20.2 API Key

- GrantRecord id 精确复用；
- key 不存在 -> 创建；
- secret only-on-create；
- 同名唯一复用；
- 多条同名 fail closed；
- key disabled/revoked；
- key reconciliation singleflight；
- logout 不 revoke 服务端 key；
- deployment change 不泄露旧 key。

### 20.3 HTTP/SSRF

- http production reject；
- dev localhost allowlist；
- private IPv4；
- loopback；
- link-local；
- IPv6 private/link-local；
- IPv4-mapped IPv6；
- DNS rebinding；
- redirect to private address；
- HTTPS -> HTTP redirect；
- URL userinfo；
- redirect limit；
- cancellation；
- timeout；
- oversized body；
- malformed JSON。

### 20.4 Models/LLM

- models list success；
- models list incomplete；
- unknown capability 不被误报；
- model cache TTL；
- 100 callers -> <= 1 refresh；
- Chat Completions normal；
- SSE fragmented frames；
- Unicode split；
- usage；
- tool calls；
- tool result；
- abrupt EOF before output；
- abrupt EOF after partial output；
- partial SSE 不整体 replay；
- 401/402/403/429/5xx；
- timeout watchdog；
- cancellation。

### 20.5 Remote/UI

- 请求 schema validation；
- service missing；
- stable error projection；
- token/key 不跨 Remote；
- register/login/logout；
- 2FA；
- token expiry recovery；
- balance insufficient recovery；
- recharge failure；
- recharge return refresh；
- stale data indicator；
- model refresh；
- localization。

### 20.6 Secret leakage

自动生成带 canary secret 的测试会话，并扫描：

- snapshots；
- logs；
- Remote fixtures；
- recorded sessions；
- diagnostics；
- analytics payload；
- generated URLs。

期望命中数：`0`。

---

## 21. 验收标准

### 21.1 功能

- fixture 客户端可注册、登录、读取当前用户、解析两类响应 envelope；
- 可以确定性复用或创建 Harness managed API Key；
- 可以加载已核验模型列表和用量/余额；
- Chat Completions 普通/SSE 路径可用；
- tools 仅在 fixture 证明后开放；
- desktop、web、headless、CLI 共享同一账户服务；
- 非交互入口返回明确登录/2FA 要求。

### 21.2 安全

- password 不持久化；
- access token memory only；
- refresh token/API Key 只进入 credential provider；
- Secret leakage test = 0；
- SSRF 禁止地址测试 100% 通过；
- 生产 HTTP 被拒绝；
- deployment origin 改变不会发送旧 secret；
- Remote 不包含 secret/raw auth response。

### 21.3 并发与稳定性

- login/logout/refresh race 压测至少 1000 次无旧 generation 覆盖；
- 100 个并发 model refresh 最多产生 1 个等价上游请求；
- refresh singleflight；
- key reconciliation singleflight；
- SSE 已输出后异常不会自动整体重放；
- logout 幂等且不等待无界网络操作。

### 21.4 错误

- 已知认证、余额、模型、限流、超时、格式错误和 5xx 场景全部映射到稳定产品错误；
- 401 最多一次 refresh；
- 402 不重试；
- 403 不进入认证循环；
- 429 保留 Retry-After 语义。

### 21.5 文档

- Compatibility Matrix 完整；
- README/JSDoc 更新；
- EN/zh-CN 文案齐全；
- compatibility fixtures 有说明；
- recorded-session snapshot 不含 secret；
- Responses 在 fixture 未通过前不可启用。

---

## 22. 风险与缓解

### 22.1 Sub2API 部署差异

风险：token 生命周期、refresh、TOTP、API Key 字段、模型字段、SSE、usage 和充值页面可能因版本/部署不同而变化。

缓解：protocol profile + compatibility matrix + fail closed；未验证能力不得静默猜测。

### 22.2 DNS Rebinding / Redirect / Proxy

风险：字符串级 URL 检查可能被 DNS 或代理绕过。

缓解：解析地址、实际 peer 检查、重定向逐跳校验、地址规范化、显式代理模型。

### 22.3 Session / Credential Race

风险：过期 token、refresh、logout、凭据变化和异步缓存竞争。

缓解：generation + singleflight + atomic credential mutation + logout wins。

### 22.4 API Key 泄露

风险：API Key 即使不等同登录 token，也能够产生费用。

缓解：credential provider、origin binding、secret scanning、Remote/log/snapshot 禁止。

### 22.5 模型发现不完整或与路由不一致

风险：`/v1/models` 可能与真实可路由模型、能力或上游状态不完全一致。

缓解：模型列表只用于 discovery；能力默认 unknown；关键能力 fixture 验证；模型失败映射为可恢复错误。

### 22.6 Provider ID 冲突

风险：内置 route 与用户配置 provider id 冲突。

缓解：reserved id、原子注册、冲突检查、明确 migration/selection 行为。

### 22.7 浏览器认证边界混淆

风险：错误地把 Sub2API 用户登录当成 Host RPC 授权。

缓解：账户身份只用于 Sub2API capability；Host 浏览器认证语义保持不变。

---

## 23. Open Questions（阶段 A 前必须关闭 P0）

### P0

1. 锁定基线登录/注册/`me` 的准确路径、字段和 envelope 是什么？
2. 目标部署是否正式支持 refresh token？是否轮换 refresh token？
3. refresh token 的失效状态码/错误码是什么？
4. 目标部署是否启用 TOTP？V1 是实现还是显式不支持？
5. API Key list/create/get 的准确接口是什么？
6. API Key secret 是否只在创建时返回？list/get 是否返回 secret？
7. Gateway API Key 的准确 header 是 `Authorization: Bearer` 还是其他格式？
8. `/v1/models` 是否按当前 API Key、group、用户权限过滤？
9. Usage/Balance 的准确接口、币种、精度、更新时间是什么？
10. 402 是否稳定代表余额不足？是否还有业务错误码？
11. recharge URL 从配置还是服务端获取？允许的 host/scheme 是什么？
12. 生产是否完全禁止 HTTP？开发例外具体 allowlist 是什么？

### P1

13. V1 是否确认只支持单 deployment + 单 active account？
14. managed key 命名是否允许包含 installation fingerprint？
15. logout 是否确认不 revoke 服务端 managed key？
16. API Key disabled 时是 re-enable 还是新建？
17. models/usage/account TTL 最终值是多少？
18. 是否允许系统代理？若允许，如何保证 SSRF/credential policy？
19. feature flag 存放在何处？
20. telemetry 是否允许记录 hashed deployment host/account id？

### P2

21. Responses 最低兼容 fixture 清单是否需要扩展到 reasoning events？
22. 是否需要未来支持多 Sub2API deployment/account？
23. 是否需要未来提供“退出并撤销此设备 Key”？
24. 是否需要未来支持 OAuth/passkey/SSO？

---

## 24. 决策摘要

V1 采用以下默认决策，除非 Open Questions 的核验结果要求调整：

- Sub2API 作为独立第一方 capability，而不是普通用户配置网关；
- access token 只驻留内存；
- refresh token 仅在上游正式提供时持久化；
- API Key 只由 Host credential provider 管理；
- API Key 与 deployment origin 强绑定；
- Harness 管理自己的 deterministic managed key，不复用任意用户 key；
- logout 默认不 revoke 服务端 key；
- production HTTPS only；
- refresh/key/models/account 使用 singleflight；
- session generation 防止旧异步结果覆盖新状态；
- `/v1/models` 只用于发现，不作为能力证明；
- 模型能力默认 unknown；
- Chat Completions 优先，Responses 默认 feature-gated；
- 支付只跳转已验证充值页面；
- Remote/UI 永远不接触长期 secret；
- 通过阶段 A/B/C 后再考虑 Responses 阶段 D。

---

## 25. 完成定义（Definition of Done）

当且仅当以下条件全部满足，Sub2API V1 才视为完成：

1. Compatibility Matrix 的所有 P0 项均有锁定基线和目标部署证据；
2. account/auth/key state machine 已实现并有 race tests；
3. secret leakage 自动测试为 0；
4. SSRF/redirect/DNS 测试全部通过；
5. dynamic models + Chat Completions + SSE + usage 在真实 fixture 上通过；
6. 401/402/403/429/timeout/5xx 行为符合错误与重试矩阵；
7. desktop/web/headless/CLI 共享同一服务；
8. UI 完成登录、账户、余额、用量、模型刷新、充值恢复；
9. feature flag 可安全关闭且无需回滚数据；
10. Responses 仍保持关闭，除非独立 fixture 和验收全部通过。
