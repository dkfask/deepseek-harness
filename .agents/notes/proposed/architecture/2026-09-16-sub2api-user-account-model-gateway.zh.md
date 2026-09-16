# Agent Note: Sub2api 用户账户与模型网关集成

Status: proposed

[English](2026-09-16-sub2api-user-account-model-gateway.md) | 中文

## 问题

Harness 需要一条第一方账户路径，让用户注册并登录 sub2api，使用用户的 sub2api API Key 发送模型请求，并查看由 sub2api 持有的余额与用量。

Harness 已分别拥有匿名遥测身份、浏览器认证、凭据存储、LLM 适配器、Remote 控制器和设置 UI，但还没有一种能力可以在不暴露上游密钥或修改 agent loop（智能体循环）的前提下连接这些关注点。

本设计采用需求提供的 sub2api 仓库基线提交 `881f3202694c6bc932446931a30c27d9675178b9`；在记录任何兼容性结论前，必须针对该基线和部署实例重新核验接口行为。

## 提案

新增独立的 `sub2api` 能力，由 Host Service Provider、客户端安全类型以及 Remote 控制器和模型提供方的消费方组成。账户会话与 conversation `SessionId`、匿名身份和浏览器认证 cookie 分离。

在 `credentialKey('sub2api', 'user-session')` 保存一个带版本的透明 `GrantRecord`。记录可以包含 sub2api 用户 id、邮箱、显示信息、产品 API Key，以及仅在 sub2api 提供时保存的正式刷新凭据。访问 JWT 保存在进程内存中，绝不保存密码，也不自行伪造 refresh token。记录只能通过 `ctx.credentials.modifyRecord` 轮换或替换；在持久化边界校验确切记录版本，并在诊断中隐藏密钥。

当部署中的 sub2api API 没有刷新能力时，进程重启或访问 JWT 过期会进入重新认证状态。持久化的 API Key 本身不能使 Harness 账户处于已认证状态；模型发送必须同时需要当前有效的账户会话和该请求持有的 API Key 快照。退出登录会清除内存 token、存储的 API Key 和账户记录、账户与模型缓存以及进行中的账户状态，同时保留匿名身份和浏览器认证。

在该能力中集中实现面向用户的 HTTP 请求。配置只接受明确的部署 base URL 和可选的已配置充值 URL，绝不接受凭据字面量。实现带 `email`、`password`、`username` 的注册；带 `email`、`password` 的登录；`/api/user/me`；仅使用目标 sub2api 构建已核验的 API Key 复用或创建接口；`/v1/models`；`/api/usage/dashboard`；以及充值 URL 查询。

客户端同时接受直接 JSON 响应和 `{ data: ... }` 包装响应，用户 API 使用 Bearer JWT 请求头，模型 API 使用已核验的 API Key 请求头，限制响应体大小并支持取消与超时，绝不记录带密钥的请求头或响应体。客户端不实现或暴露 sub2api Admin API、支付签名、webhook（回调）、Admin API Key。

每个服务端请求都校验 `http` 或 `https`，拒绝无效、本机、环回、链路本地、私有、组播、未指定和其他保留地址，连接前解析主机名，并重新校验每个重定向目标。只有配置的协议与主机通过策略的充值 URL 才能返回；客户端不把长期 JWT 附加到 URL，也不把它放入普通日志。

将传输和状态失败映射为稳定的产品错误，覆盖未认证或 token 过期、余额不足、模型或账户不可用、限流、超时、请求无效、响应格式错误和服务失败。401 会使当前内存 token 失效，并且最多允许一次状态重新加载或重新认证转换。402 会阻止模型发送并暴露充值操作。403、429、超时和 5xx 对重试策略与 UI 恢复保持可区分。

增加 `sub2api` Remote 命名空间，使用已验证请求，并为状态、注册、登录、退出登录、账户刷新、用量、模型刷新和充值 URL 查询提供显式的脱敏投影。Remote 结果绝不包含访问 token、刷新凭据、API Key、上游原始响应、Admin 密钥。只转发浏览器所需的非敏感账户、模型和用量失效事件。

在组合提供交互通道时，使用 `ctx.authorization` 承载交互式登录和注册流程。每个流程都遵守取消并在尝试期间提交记录。headless 与 CLI（命令行界面）组合在没有交互提示能力时快速返回可执行的登录要求错误，而不是假装提供交互式提示。

为 `llm-pi-ai` 增加一个仅供 Host 使用的路由注册与运行时 API Key 解析器，负责保留的 `sub2api` 提供方。路由使用配置的 base URL 加 `/v1`、`openai-completions` 和从 `/v1/models` 获取的模型；不使用 `apiKeyEnv`、环境变量或设置文档传递托管 API Key。解析器在发送前捕获已认证会话；没有会话时，在任何网络活动前抛出稳定的未认证错误。

复用 pi-ai 已有的 OpenAI 兼容请求转换、SSE（Server-Sent Events，服务器推送事件）流组装、用量处理、工具调用生命周期、超时 watchdog（看门狗）、归因请求头和提供方重试策略。把路由注册在共享 base 组合中，让 desktop、web、headless 和 CLI 使用同一个服务。只有真实 fixture 证明部署中的 sub2api 具备 Responses 的事件、工具调用、用量、终止和错误行为后，才允许启用 Responses。

通过现有 `settings.section` slot（具名可注册位置）增加账户设置区。它负责登录、注册、退出登录、脱敏账户与余额显示、用量加载、模型刷新状态、余额不足恢复，以及打开已核验充值页面的充值按钮，不在其中嵌入长期凭据。页面返回后，从 sub2api 刷新账户和模型状态，而不是相信浏览器回调数据。

所有账户文案通过功能自有的英文和简体中文 locale dictionary（本地化字典）注册，覆盖校验、认证、token 过期、余额不足、服务不可用和充值跳转失败。设置 shell 保持不变；该功能使用现有 Remote、locale、settings、slot 和 open-url 服务。

按兼容性顺序交付四个阶段。阶段 A 增加 sub2api 能力、凭据记录、登录和注册生命周期、`/api/user/me`、API Key 生命周期、包装解析、错误映射、URL 策略和 HTTP fixture；不增加账户 UI、充值跳转或 Responses。阶段 B 增加内置提供方、动态模型列表、Chat Completions 普通与 SSE 路径、工具、用量、余额错误和共享组合覆盖。阶段 C 增加账户 UI、用量显示、充值跳转、本地化和浏览器持久化覆盖。阶段 D 只有在协议 fixture 通过后才可以启用 Responses；未来的支付 facade（门面）仍只存在服务端，并且不属于第一版。

## 备选方案

**把 sub2api 当作普通的用户配置 pi-ai 网关。** 这会要求用户提供 URL 和 API Key，使托管账户对 Host 不可见，并有持久化或返回产品凭据的风险。独立路由保留所需的登录流程，并把密钥解析留在 Host 内。

**把访问 JWT 或 API Key 放入设置、环境变量或会话事件。** 这些存储会对配置、日志、回放或其他进程可见，也无法提供所需的退出失效语义。凭据提供方的透明记录与进程内访问 token 让所有权保持明确。

**新增独立的 sub2api LLM 适配器并复制 OpenAI 流式逻辑。** 这会分叉 pi-ai 已维护的转换、SSE、工具调用、用量、超时和重试行为。对 `llm-pi-ai` 增加受限注册扩展可以保留同一套 OpenAI 兼容实现。

**在第一版实现 Harness 自有支付 facade。** 这会把 webhook 验签、支付状态、Admin API 凭据、幂等充值和订单账本加入明确要求复用 sub2api 支付能力的范围。第一版只打开已配置的充值页面，并刷新由服务端持有的账户状态。

**因为存在路由就启用 Responses。** 路由存在不能证明事件、工具调用、用量或终止事件兼容。Responses 会保持禁用，直到真实兼容性 fixture 证明完整路径。

## 验收标准

- 基于 fixture 的客户端可以注册、登录、读取 `/api/user/me`，通过已核验接口复用或创建一个产品 API Key，加载模型，读取用量，并解析两种响应包装形式。
- 持久化记录不包含密码或伪造的 refresh token；访问 JWT 保持仅运行时保存，除非正式刷新字段已核验；退出登录移除 API Key 及所有账户与模型缓存，同时不影响匿名身份或浏览器认证。
- 单元和 HTTP fixture 覆盖请求头选择、token 状态转换、包装解析、URL 与重定向主机策略、401/402/403/429/超时/5xx 映射、格式错误响应、取消和响应体大小限制。
- Remote 测试证明请求校验、安全字段投影、服务缺失与失败映射，以及 token、API Key、上游原始响应和 Admin 凭据不会跨线传递。
- 内置提供方在发送网络请求前拒绝未认证请求，加载已核验模型列表，完成 Chat Completions 普通与 SSE 请求，保留用量，正确回放工具调用与结果，并把余额和可重试失败映射为稳定的 LLM 结果。
- desktop、web、headless 和 CLI 共享组合挂载同一个账户服务；非交互入口返回清晰的登录要求错误。
- 账户 UI 测试覆盖注册、登录、退出登录、token 过期恢复、余额不足恢复、用量、模型刷新、充值跳转失败，以及从充值页面返回后的状态刷新。
- 英文和简体中文本地化字典、包 README/JSDoc 约定、兼容性文档和无密钥 recorded-session snapshot（记录会话快照）覆盖已交付行为。
- 除非针对记录的 sub2api 基线通过真实事件、工具调用、用量、终止和错误 fixture，否则不存在 Responses 支持。

## 风险

不同 sub2api 部署的 token 生命周期、API Key 列举行为、模型响应字段、SSE 分帧或充值页面配置可能不同。客户端必须核验部署约定，并把未核验接口和 Responses 支持排除在产品之外，而不是静默猜测。

DNS 重绑定、重定向、代理行为以及 IPv4 或 IPv6 的文本别名都可能绕过 URL 字符串检查。HTTP 实现必须绑定连接实际使用的已校验解析目标，并显式测试禁用地址类别与重定向。

过期访问 token 或 API Key 可能与退出登录或凭据文件变化竞态。每个请求必须捕获会话 generation（代次），并拒绝或丢弃已失效代次的结果；退出登录必须幂等，且不能等待无界网络操作。

即使访问 JWT 保存在内存，持久化 sub2api API Key 仍使账户记录成为敏感数据。必须继续遵守本地凭据提供方的文件权限、脱敏视图和诊断规则，并断言密钥不会进入 snapshot、日志、Remote 事件或 URL。

内置路由可能与相同 id 的用户配置提供方或默认模型选择冲突。注册必须保留路由 id、原子替换注册，并记录选择行为，不能允许所有权含混。

账户 UI 依赖浏览器认证的本地 Host RPC，但它不是产品身份认证。实现不得使用 sub2api 登录来授权任意 Host 请求，也不得改变浏览器 cookie 语义。
