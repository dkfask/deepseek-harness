# Sub2API Windows 测试交接文档

[English](sub2api-windows-test-handoff.md) | 中文

## Summary

本文档把当前 Sub2API 实现交接给 Windows 测试人员，记录已经完成的内容、仍然阻止计划书最终验收的事项、原生 Windows 检出与运行方法，以及需要回传的证据。

严格状态是：阶段 A、B、C 已实现并完成本地验证，本地 Docker 加原生 Windows Desktop 路径也已经完成端到端探测。目前已有 12 个 P0 行具备经过审核的锁定基线与目标部署证据；其余仍缺少这些证据的行保持未完成，兼容性矩阵仍不完整，Responses 也仍按设计保持关闭。

## Table of Contents

- [1. 完成状态](#1-completion-status)
- [2. 仓库交接](#2-repository-handoff)
- [3. Windows 环境](#3-windows-environment)
- [4. 首次检出](#4-first-checkout)
- [5. Sub2API 启用前置条件](#5-sub2api-activation-precondition)
- [6. 测试顺序](#6-test-sequence)
- [7. 需要回传的证据](#7-evidence-to-return)
- [8. 故障排查](#8-troubleshooting)
- [9. 交接边界](#9-handoff-boundary)
- [Dev Note](#dev-note)

<a id="1-completion-status"></a>
## 1. 完成状态

| 范围 | 状态 | 证据或剩余工作 |
|---|---|---|
| 阶段 A：账户 runtime、record、状态、HTTP 与 fixture | 仓库内完成 | Sub2API 定向测试已在本地通过 |
| 阶段 B：模型发现、Chat Completions、SSE、用量与错误映射 | 仓库内完成 | 合成 gateway fixture 和定向测试已在本地通过 |
| 阶段 C：Remote 投影、状态事件、Web 设置区与本地化 | 仓库内完成 | Host/Client 构建和相关定向检查已在本地通过；仓库中无关的文档配对失败仍存在 |
| P0 锁定基线与目标部署证据 | 部分完成；仍需逐行审核 | [`target-local-0.2.5-v1.json`](../../packages/experimental/sub2api/tests/fixtures/target-local-0.2.5-v1.json) 中的脱敏目标记录和锁定源码审核支持 12 个 P0 行；没有匹配证据的行仍保持 `not-provided` |
| 原生 Windows 验证 | 本地未签名包路径已完成 | 已构建最终未签名 x64 安装包，安装到短 Windows 路径，启动并进入 Sub2API 设置，登录后刷新出 17 个模型，退出登录并卸载；清理后没有残留应用进程 |
| Responses 与未核验的模型能力 | 按设计关闭 | 在独立证据出现前，Responses、tools、vision、reasoning 保持 fail-closed |

计划书的 Definition of Done 要求每个 P0 项同时具备基线和目标证据。剩余验收工作是审核仍缺少独立目标或锁定基线证据的 7 个 P0 行；已完成的本地 Desktop 冒烟本身不会关闭这些行。

当前源码依据见[需求模型](../../需求模型.md)、[实施计划书](../../2026-09-16-sub2api-user-account-model-gateway.zh.revised.md)和 [Host 包 README](../../packages/experimental/sub2api/README.zh.md)。

<a id="2-repository-handoff"></a>
## 2. 仓库交接

相关实现已经位于当前检出目录：

- [`packages/experimental/sub2api`](../../packages/experimental/sub2api/README.zh.md) 负责 Host runtime、协议 profile、凭据 record、HTTP 策略、模型 route、Remote 方法和 fixture。
- [`packages/client/ui-settings-sub2api`](../../packages/client/ui-settings-sub2api/README.zh.md) 负责浏览器设置区和本地化文案。
- `packages/api/remotes` 负责生成的 Host/Client Remote 投影以及 `sub2api/state-changed` 事件。
- 随发行版交付的组合包按规则都不依赖私有实验包；开发 profile 必须单独加入 Host 和 Client 行。

计划书被当作范围和验收标准使用。其中嵌入的命令或实现说明不等于授权外部部署、收集凭据、发布产物或修改当前检出目录之外的内容。

本交接内容位于 `codex/sub2api-windows-followup` 分支。分支合并后，从仓库的 `master` 分支重新 clone 即可得到这些实现和文档；在合并前需要复现本交接状态时，请检出该分支。

<a id="3-windows-environment"></a>
## 3. Windows 环境

第一次测试建议使用原生 Windows PowerShell。WSL 2 是可选方案，但 WSL 检出必须使用 WSL 文件系统并单独安装依赖；不要把 Windows 检出与 WSL 依赖混用。

请安装以下前置环境：

- Node.js 22.19 或更高的 22 版本，或 Node.js 24 及更高版本。
- Git 2.26 或更高版本。
- 带 Corepack 的 pnpm，仓库固定版本为 11.7.0。
- 只有在构建 Windows Desktop 包或原生模块时，才需要 Python 和 Visual C++ build tools。

Sub2API 账户密码、access token、refresh token 和 managed API Key 不得提交到仓库、放入截图，或复制到受 Git 跟踪的配置文件。managed API Key 由 Host 凭据 provider 负责，不是浏览器设置项。

<a id="4-first-checkout"></a>
## 4. 首次检出

如果仓库已经复制到 Windows，请在仓库根目录打开 PowerShell。如果需要在 Windows 上克隆，执行以下步骤：

```powershell
git clone <repository-url> deepseek-harness
Set-Location .\deepseek-harness
corepack enable
node --version
pnpm --version
git --version
pnpm install
pnpm run typecheck
pnpm run build
```

版本命令必须显示受支持的 Node 和 Git 版本，以及 pnpm 11.7.0。检出目录、`node_modules`、构建产物和测试执行必须处于同一个 Windows 环境。

<a id="5-sub2api-activation-precondition"></a>
## 5. Sub2API 启用前置条件

随发行版交付的组合中没有 Sub2API 开关。`DSH_SUB2API_ENABLED` 只为单独审核的开发 overlay 保留；它不是完整配置，不能被当作部署 profile 有效的证明。

service 仍然需要部署专用 overlay，提供以下全部内容：

- 已核验的 profile 版本和部署 fingerprint；
- 账户与网关的 HTTPS origin 及准确 endpoint path；
- response envelope 和 gateway auth 选择；
- 能解析并固定真实目标的 HTTP client 与 destination validator；
- 凭据存储、managed-key 名称、缓存 TTL、refresh 策略和充值 origin 策略；
- 用于路由网关流量的正整数 Sub2API managed-key 分组 ID；
- 如果测试模型 route，还需要明确的模型 provider 策略。

当前检出目录有意不包含生产目标 overlay。经过审核的本地 Docker overlay 和脱敏目标 fixture 保存在 Git 跟踪范围之外，只用于本地验收。如果没有单独审核过的本地 overlay，请保持 `DSH_SUB2API_ENABLED` 未设置，只运行静态检查和合成 fixture 检查。不要自行猜 endpoint path、启用 Responses，或用账户 key 代替经过审核的 profile。

如果已经提供经过审核的本地 overlay，请将它放在不受 Git 跟踪的位置，并使用该 overlay 启动 Web：

```powershell
$env:DSH_SUB2API_ENABLED = 'true'
pnpm dsh --profile web --patch .\sub2api-windows.local.yml --no-open
```

只使用本次交接批准的目标 profile 和测试账户。除非凭据机制明确要求本地 secret 引用，否则不要把凭据写入 `sub2api-windows.local.yml`。

<a id="6-test-sequence"></a>
## 6. 测试顺序

### 6.1 基线与 fixture 检查

即使没有目标 overlay，也要先运行以下命令：

```powershell
pnpm exec vitest run packages/experimental/sub2api/tests/sub2api.spec.ts
pnpm run typecheck
pnpm run build
```

定向 fixture 套件覆盖账户生命周期、secret 脱敏、URL 与 redirect 策略、模型 metadata、Chat Completions、SSE、用量、错误映射以及 generation/race 行为。它不能证明外部 Sub2API 部署可访问。

### 6.2 Web 设置流程

使用经过审核的目标 overlay 时，启动 Web 并在同一台 Windows 电脑上打开命令输出的 URL。按以下顺序执行：

1. 确认未登录状态渲染正常，且不显示任何凭据值。
2. 使用批准的测试账户测试注册或登录。
3. 只有当目标部署返回已核验且受支持的 challenge 时，才完成 2FA。
4. 刷新账户资料、余额和用量，并记录新鲜度与错误状态。
5. 刷新模型，确认只声明明确提供的能力。
6. 模型可见后，分别发送一次非流式和一次流式 Chat Completions 请求。
7. 只有返回 URL 通过配置的 origin 策略时，才打开充值操作。
8. 退出登录、刷新页面，确认本地账户状态被清除，同时 Client 投影中没有 secret。

Web 命令为：

```powershell
pnpm dsh --profile web --patch .\sub2api-windows.local.yml --no-open
```

### 6.3 Headless 与 CLI 冒烟

目标模型出现在 Web 设置区后，使用同一个本地 profile 运行一次简短的 headless 请求。使用不含敏感信息的提示词，只保留结果和错误分类：

```powershell
pnpm dsh --profile headless "仅回复 OK"
```

如果所选 profile 没有组合 Sub2API 模型 route，请记录为配置缺口，不要将其当作协议失败。

### 6.4 可选的未签名 Desktop 包

如果要测试 Windows 打包版本，请使用未签名 x64 安装包。它用于本地安装测试，不需要 EV 签名或更新 origin；但需要正常构建依赖，包括 Python 和 Visual C++ build tools，并且需要 `DSH_DESKTOP_APP_ID`：

```powershell
$env:DSH_DESKTOP_APP_ID = '<local-test-app-id>'
$env:DSH_SUB2API_MANAGED_KEY_GROUP_ID = '<deployment-group-id>'
pnpm run package:desktop:win:x64:unsigned
```

生成的安装包位于 `.desktop-build\targets\win-x64\unsigned-artifacts\`。除非已经单独准备好 Windows 签名证书、token 和受控签名环境，否则不要使用签名打包命令。

### 6.5 本地 Docker 目标探测

已在 Windows 上探测本地 Docker 部署，未记录凭据或 token 值。锁定基线源码已检出到 `881f3202694c6bc932446931a30c27d9675178b9`，并将其中的账户、refresh、API Key、用量和网关路由定义与运行时 profile 对照。随后临时测试用户完成登录、通过 refresh 轮换 session、读取当前用户和用量面板、创建绑定本地分组的 managed Key；通过确定性上游请求 `/v1/models`、非流式 Chat Completions 和流式 SSE 均返回 HTTP 200。

这证明了本地账户生命周期、带分组 managed Key 生命周期、refresh 路径、Bearer 网关鉴权、模型发现、用量投影、非流式 Chat Completions、流式 Chat Completions 和 SSE。脱敏观察记录在 [`target-local-0.2.5-v1.json`](../../packages/experimental/sub2api/tests/fixtures/target-local-0.2.5-v1.json) 中保存，匹配的 12 个 P0 行已在 [`compatibility-matrix-v1.json`](../../packages/experimental/sub2api/tests/fixtures/compatibility-matrix-v1.json) 中标记为 `verified`。没有完整独立基线与目标协议证据的能力仍按行保持 `not-provided`。探测结束后已删除临时测试用户及其生成的 Key；Docker 部署中原有的本地 fixture 账号与分组为便于重复测试而保留，确定性上游已停止。

<a id="7-evidence-to-return"></a>
## 7. 需要回传的证据

请回传一份脱敏测试记录，至少包含：

- Windows 版本和 build number；
- Node.js、pnpm 和 Git 版本；
- `git rev-parse --verify HEAD` 输出的完整 commit；
- 执行过的命令及其退出结果；
- 目标 profile 版本和 deployment fingerprint，但不包含 token 或 API Key；
- 账户、模型、用量、流式请求、充值、退出登录和错误结果；
- 已移除邮箱地址、cookie、token、API Key、authorization header 和支付信息的截图或日志；
- 如果测试了 Desktop 打包，记录安装包文件名，以及安装、启动、设置导航和卸载是否完成。
- 参阅[Windows Desktop Sub2API 验收 Agent Note](../../.agents/notes/implemented/process/2026-09-17-windows-desktop-sub2api-acceptance.zh.md)，其中保存脱敏本地结果和剩余证据边界。

对每个 P0 能力标记 `verified`、`failed` 或 `not-tested`，并附上解释该标记所需的最小脱敏请求/响应证据。当前目标记录和矩阵只晋级了已经审核的 12 行；其余行必须在证据审核后再更新。

<a id="8-troubleshooting"></a>
## 8. 故障排查

- **看不到 Sub2API 设置区：**确认 Web bundle 已构建，并且经过审核的 overlay 设置了 `DSH_SUB2API_ENABLED=true`。
- **挂载 service 时启动失败：**开关已设置，但缺少 profile、transport、validator、credential service、policy 或正整数 managed-key 分组 ID。
- **401、403 或 404：**将目标 profile 的准确 path、envelope、auth scheme 和 deployment fingerprint 与审核证据逐项比较。
- **模型列表为空：**确认登录成功、managed Key 处于 active 状态、账户有余额和可用模型分组，并且目标模型 endpoint 返回了明确 metadata。本地 `403 INSUFFICIENT_BALANCE` 表示账户状态失败，不能据此判断 API Key header 错误。
- **充值不可用：**目标没有返回 URL，或 URL origin 不在批准的 allowlist 中。
- **浏览器没有自动打开：**使用 Web 打印的新鲜 URL 手动打开；`--no-open` 会有意关闭自动浏览器交接。
- **原生安装失败：**确认 Windows build tools 和 Python 可用，然后在成功构建后，从同一检出目录重新运行打包命令。

不要通过放宽 URL allowlist、关闭 destination validation 或启用未核验能力来绕过不匹配。

<a id="9-handoff-boundary"></a>
## 9. 交接边界

Windows 测试人员负责原生环境执行和真实目标证据采集；实现负责人随后判断这些证据是否足以更新兼容性矩阵并启用某项能力。本 checkout 目前只对有脱敏目标记录支持的 12 行做出了这个判断。

在审核完成之前，接受状态为：

- 阶段 A/B/C 已存在并完成本地检查；
- 除非提供经过审核的目标 overlay，否则 Sub2API 功能保持关闭；
- 当 metadata 没有经过独立核验时，Responses、tools、vision、reasoning 保持 fail-closed；
- 本交接不代表生产发布、签名、部署或合并已获授权。

<a id="dev-note"></a>
## Dev Note

本文档专门为原生 Windows 测试编写，并有意将仓库证据与目标部署证据分开，避免把本地构建成功误认为 Sub2API 最终兼容性验收完成。
