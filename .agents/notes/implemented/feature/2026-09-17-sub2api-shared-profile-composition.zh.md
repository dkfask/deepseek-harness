# Agent Note: Sub2API shared profile composition

Status: implemented

[English](2026-09-17-sub2api-shared-profile-composition.md) | 中文

## Problem

Sub2API capability 已经有 Host、Remote、UI 和 fixture 代码，但发行 profile 没有挂载 Host service。因此 desktop 和非 desktop 表层无法共享同一个账户 runtime，Cordis Loader 也没有证明部署专用 profile 能够构造自己的传输。

## Decision

`dsh-base` bundle 拥有一个默认关闭的 `sub2api` 行。`DSH_SUB2API_ENABLED=true` 会在所有基于 base 的表层启用该行，包括 Web、headless、SDK、ACP 和 desktop 组合；Web 客户端设置行使用同一个 gate。该行通过显式环境表达式读取部署 URL、deployment fingerprint、缓存和传输上限、充值策略以及模型能力证据。

`Sub2apiService` 接受已规范化 profile，或者接受 Loader patch 使用的普通 profile 字段。如果组合没有注入传输，它只会针对两个已配置 origin 和 IP literal 目标创建有界 HTTP client。生产 hostname 必须显式提供 resolver 和固定传输，因此便利路径不会静默地把 DNS 变成 SSRF 策略决定。

标准 codec 遵循本地部署中观察到的锁定 Sub2API 0.2.5 返回约定：注册包含 `username`，账户和 Key 标识符接受安全的数字 ID，Key 列表接受分页的 `items` 集合，`/auth/me` 提供安全的账户余额，dashboard 的 `total_actual_cost` 提供用量数值。没有能力元数据的模型行仍保持 unknown，只有部署显式提供已核验的 Chat Completions/SSE 证据和容量时才会开放。

HTTP client 会读取有界的非成功 JSON body，并识别部署返回的 `ADMIN_COMPLIANCE_ACK_REQUIRED`。它只通过 Host 和 Remote 错误详情传递有界的合规元数据；desktop 设置区显示本地化提示，但不会代替确认，也不会回显上游 response body。

HTTP client 也会把目标部署的 `INSUFFICIENT_BALANCE` 业务码映射为稳定的余额错误，即使网关使用 HTTP 403 返回该业务错误。这样，使用 HTTP 402 或 HTTP 403 表达余额不足的部署都能进入相同的恢复路径。

## Alternatives considered

**只在新的自定义 bundle 中挂载 service。** 否决，因为请求的账户 capability 必须由 desktop 和现有基于 base 的命令表层共享；把行放在 `dsh-base` 中可以让所有表层使用同一个 opt-in 入口。

**让本地 HTTP client 信任任意配置的 hostname。** 否决，因为 URL 文本本身不能固定网络目标。默认构造路径仅限显式的 IP literal 开发目标；生产集成通过注入传输拥有 DNS 解析、peer 校验和固定逻辑。

**只要账户行启用就同时启用模型 route。** 否决，因为模型发现不能证明 Chat Completions、SSE、容量、tools 或 Responses。route 仍由显式证据单独门控，Responses 继续关闭。

## Consequences

基于 base 的 profile 现在会把实验性 Sub2API 包带入依赖闭包；该包被明确列为公开实验性发布成员，因此发布后的 base 产物仍然可安装。普通启动不变，因为该行默认关闭。启用本地 Docker 部署只需要部署环境和可访问的后端；启用模型请求还需要 Sub2API 配置了可用的模型分组以及独立核验的能力设置。本地 0.2.5 容器当前证明了 health、public settings、认证、refresh 和 Key 分页，而没有可用分组时模型网关返回 `403`，因此在记录普通用户端到端 fixture 前，兼容性矩阵仍保持目标 `not-provided`。

本包的真实 Loader 组合测试和 Web 启动冒烟保护挂载路径。合成 fixture 继续负责协议、并发、错误和 secret 泄漏证据；两类测试都不会单独把目标部署矩阵升级为已核验。
