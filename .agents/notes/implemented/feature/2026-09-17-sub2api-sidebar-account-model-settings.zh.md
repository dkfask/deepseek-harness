# Agent Note：Sub2API 侧栏账户与模型设置

状态：已实现

[English](2026-09-17-sub2api-sidebar-account-model-settings.md) | 中文

## 问题

登录 Sub2API 部署后，Web 客户端没有在侧栏展示当前身份，账户区域也没有直接进入模型配置的入口。用户必须先打开通用设置，再自行判断部署模型和自定义提供方的管理位置。

## 决策

在 `sidebar.footer.action` 注册 Sub2API 自有的账户卡片。卡片读取已有的 Sub2API 远程状态，显示账户显示名或稳定的账户回退值，并在状态可用时显示已发现的模型数量。退出登录时不显示，侧栏变窄时收缩为头像。现有设置入口继续位于底部右侧。

模型管理继续使用现有的 `models` 设置区。认证后的 Sub2API 设置区现在显示本地化的模型设置提示，可在不关闭设置面板的情况下打开该设置区。系统自用的 Sub2API 提供方即使没有用户设置命名空间，也会显示在该页面；其卡片从配置的网关 endpoint 刷新模型目录，不使用客户端写死的模型列表。这样复用了现有的部署模型和自定义提供方持久化路径，没有新增第二套模型存储。

只把非 secret 的托管 API Key 元数据投影到 Host 状态视图。认证后的账户区和 `settings.models.provider-card` 系统提供方卡片会显示 Key 名称、分组、可用的指纹、端点类型和网关返回的模型；Key secret 始终只留在 Host 内。ThunderUni 标志在侧栏和空会话首屏都使用提供的 `thunderuni-ai-logo.svg`，并以内嵌资源形式打入 Web bundle。

允许已认证账户所有者直接在该系统提供方卡片中修改托管 Key 的分组。先从认证用户的 `/groups/available` endpoint 加载命名分组并显示为下拉菜单，再通过带认证的用户侧 `PUT /keys/{id}` endpoint 发送所选分组；Host 保留仅 Host 可见的 secret，把服务端返回的分组写回与部署绑定的 grant，并使模型目录缓存失效，让下一次发现使用新的路由。当独立的 Sub2API 提供方拥有部署模型目录时，在模型设置页隐藏默认的 `deepseek-official` 行。退出登录和其他非 Sub2API 提供方不显示该编辑控件。

在 Host 的 `sub2api-models` 设置命名空间中持久化每个模型的上下文窗口覆盖值。认证后的系统提供方卡片可以编辑该值，runtime 会在动态 LLM provider 解析 profile 前把它应用到已发现模型描述，因此重启后仍然保留并影响后续请求。

设置卡片会为当前选中的匹配路由发布一次性的浏览器更新，因此当前 Conversation 的上下文计量器会立即显示保存后的容量；下一次请求仍会把该容量作为 Session 的持久化容量记录下来。

## Alternatives considered

**只在 Sub2API 管理端修改分组。** 否决，因为账户所有者已经拥有带认证的用户侧 Key 更新 endpoint，不应为了修改自己拥有的 Key 而额外依赖管理员权限。

**把 API Key secret 暴露给浏览器执行修改。** 否决，因为 access token 和托管 Key secret 都由 Host 持有；把任一凭据转给 Client 会破坏 secret-free Remote 投影。

**只把配置中的分组作为唯一事实来源。** 否决，因为用户侧修改会在重启后丢失，模型发现也会继续沿用旧分组路由。

## 后果

登录后的底部区域现在提供持续可见的身份信息和模型管理入口，同时保留现有设置架构。模型页面增加系统提供方行和后端模型摘要，但不替换现有模型／提供方编辑器。分组编辑器使用服务端返回的名称，不再要求用户猜测数字 ID；部署自有模型目录时也不会在这些模型旁显示默认 DeepSeek 提供方。账户卡片不保存凭据，也不复制账户状态；它订阅 Sub2API 状态变更事件，并使用共享的远程状态读取器。没有凭据时，退出登录的 Web 冒烟测试无法展示认证账户卡片，因此认证后的渲染约定由组件测试覆盖。

## 验证

- 侧栏账户组件测试覆盖退出登录时不显示、认证后的显示名和模型数量，以及收缩后的头像显示。
- 设置根组件和侧栏根组件定向测试在加入新的可选设置区导航属性后通过。
- 新增圆形头像通过 corner-shape 样式门禁。
- Sub2API 包 typecheck 和 bundle 通过。
- 模型设置文案、账户 Key／分组投影、用户提供的完整 logo 素材以及 README 文档已加入英文和中文的本地化／文档配对。
- 模型设置卡片从 `/groups/available` 加载命名分组，用下拉菜单校验并通过带认证的用户 API 持久化所选分组，不暴露 Key secret，然后重新刷新后端模型目录；部署自有模型目录时隐藏默认 DeepSeek 行。
- 系统提供方行、后端模型刷新和空会话首屏 Logo 已加入定向测试；ThunderUni Web 构建已用上传的 SVG data URI 完成验证。
- ThunderUni Web profile 会关闭内测声明和官方 DeepSeek 首次运行引导弹窗。只要后端返回自有 Sub2API 模型，客户端模型目录就会移除内置的 `deepseek-official` 分组；Host 默认选择不再可用时改用后端第一个模型。DeepSeek 适配器仍可为 Host 内部服务挂载，但不再作为用户可选模型显示。
- Sub2API 工具调用默认继续 fail-closed。本地目标已对 `gpt-5.6-sol` 完成真实工具调用探测，因此 ThunderUni Web 和 Desktop 只通过 `DSH_SUB2API_VERIFIED_TOOLS_MODELS` 为该模型显式开启工具；未知模型元数据不会自动授予工具权限。
- Sub2API 持久会话在 Host hydrate 阶段会刷新账户 token 和网关模型目录，因此恢复的 `sub2api/<model>` 选择会在第一轮 Agent 请求前完成注册，不会再因模型未配置而失败。
- 系统提供方卡片接受带可选 `K`、`M` 或 `G` 后缀的正整数上下文窗口；Host 会校验并持久化最终的安全整数，再应用到动态模型 profile。
- Conversation 上下文计量器测试覆盖当前选中路由的即时容量更新，Sub2API runtime 测试覆盖后续请求实际使用的持久化值。
