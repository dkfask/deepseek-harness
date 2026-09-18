# Agent Note：Windows Desktop Sub2API 本地验收

状态：已实现

[English](2026-09-17-windows-desktop-sub2api-acceptance.md) | 中文

## 问题

Windows 交接需要证明带品牌的 Desktop 包可以使用 Docker Sub2API 后端，同时不会启动 Harness Web 前端。旧交接只记录了打包和启动冒烟，没有区分已经完成的本地证据与仍需独立部署审核的能力。

## 决策

将本地验收路径拆成三类观察：锁定的上游源码版本、带确定性测试上游的 Docker 后端，以及最终未签名的 ThunderUni Desktop 包。只记录这些路径实际观察到的字段和结果。经过审核的脱敏目标记录和源码对照将匹配的 12 个 P0 行标记为 `verified`；当前用户解码器已兼容目标返回的空可选 username，Desktop UI 已投影余额，但余额恢复和其余行在完整执行基线与目标协议前仍保持 `not-provided`。Responses 和其他未核验的模型能力保持关闭。

## 备选方案

**在本地 Chat 请求成功后把所有 P0 行标为 verified。** 否决，因为模型请求成功不能证明注册、2FA、充值、SSRF、全部错误类别或 Responses 事件约定。

**只使用 Desktop UI 作为协议证据。** 否决，因为 Host runtime 负责 token、managed Key、网关请求和脱敏状态；UI 成功不能替代这些 seam 的源码与目标观察。

**保持 Windows 交接文档不变。** 否决，因为安装、设置导航和卸载已经完成，但文档仍将这些操作标为待执行。

## 后果

本地工作流现在拥有 Docker 健康状态、Host 账户与网关行为以及带品牌 Desktop UI 的可复验验收记录。该记录不授权生产部署、签名或兼容性矩阵晋级。每次探测后都会删除临时测试用户及生成的 Key；原有本地 fixture 账号与分组保留，用于重复 Docker 测试。

## 验证

- 锁定基线源码已检出到 `881f3202694c6bc932446931a30c27d9675178b9`。
- 经过审核的目标观察记录在 `packages/experimental/sub2api/tests/fixtures/target-local-0.2.5-v1.json` 中，只包含请求路径、状态码、响应字段名、数量和流终止结果。
- 在 `D:\projects\API\sub2api-deploy` 执行 `docker compose ps`，Sub2API、PostgreSQL 和 Redis 容器均报告 healthy。
- 临时用户通过本地 Docker 目标完成登录、refresh token 轮换、当前用户、用量面板、managed Key 创建、模型发现、非流式 Chat Completions、流式 Chat Completions 和 SSE 终止。没有记录 secret。
- 最终 ThunderUni 未签名 x64 安装包已构建，从未解包产物启动，打开 Sub2API 设置、登录、显示数值余额、刷新用量和 17 个模型且没有错误提示、选择 Sub2API 模型，并通过本地网关完成流式 Chat Completions 请求。清理后没有残留应用进程。
- 最新重打包已包含锁定部署使用的 `verify_code` 注册字段映射和 managed Key 分组绑定；修正后 Sub2API 和 Loader 组合定向测试通过 44/44，并包含锁定注册、TOTP 字段名、跨分组同名 key、错误分组响应和公开设置缓存回归测试。
- 共享 base profile 现在将 `DSH_SUB2API_TOOLS_ENABLED` 暴露为显式开关，ThunderUni 打包将其固定为 `false`；当前没有目标 tools fixture，因此 tools 能力继续保持 fail-closed。
- managed Key reconciliation 现在会记录并强制校验配置的 `group_id`；其他分组的同名 key 会被忽略，创建响应返回错误分组时会 fail-closed。目标探测已确认 `/keys` 列表项和创建响应都暴露 `group_id`。
- 目标未认证 `/api/v1/settings/public` 响应暴露了 `registration_enabled=false`、`payment_enabled=false`、`payment_balance_disabled=false` 和空充值 URL 字段。Host runtime 会在不携带凭据的情况下读取这些设置；部署未启用时，Desktop 设置区会隐藏注册和计费控件。
- 最新未签名安装包大小为 180,174,014 字节。其内嵌运行时载荷保留了 ThunderUni profile、本地 account 和 gateway URL、managed Key 分组 `5`、Bearer 网关认证并关闭 tools；打包的 base patch 包含公开设置 endpoint 和显式缓存配置，Sub2API bundle 包含公开设置解码器和分组绑定。
- 定向源码检查已通过：四文件 Desktop/Sub2API 定向测试 57/57、typecheck、ThunderUni 未签名 x64 打包、封装运行时配置静态检查、Docker 健康复核，以及 Agent Note、package README 和双语配对检查。仓库仍有交接文档中记录的两个既有翻译配对失败。
- 兼容性矩阵根据审核后的源码和目标观察将 12 个 P0 能力标记为 `verified`；注册、2FA、余额恢复、HTTP 错误类别、SSRF 部署行为、充值 URL、Responses 和 tools 仍未核验。
