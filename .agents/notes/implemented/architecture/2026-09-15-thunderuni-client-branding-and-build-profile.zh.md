# Agent Note: ThunderUni 客户端品牌与构建 profile

Status: implemented

[English](2026-09-15-thunderuni-client-branding-and-build-profile.md) | 中文

## Problem

这个 fork 需要为浏览器客户端建立私有产品身份，同时不改变上游 `dsh` 启动器、agent runtime、会话格式、工具行为或服务端请求面。直接替换上游品牌还会让既有官方客户端 profile 更难构建和验证。

## Decision

ThunderUni 以客户端品牌包的形式实现，目录为 `packages/client/ui-brand-thunderuni`。该包通过现有的 `sidebar.brand.mark` 与 `sidebar.brand.name` slot 提供自己的闪电标记和本地化 wordmark。它使用完整的英文和简体中文字典注册 `thunderuni` locale namespace，并且只有在 `DSH_CLIENT_BUILD_PROFILE` 为 `thunderuni` 时才注册 slot occupant。声明感知的 effect 让两个 occupant 在声明顺序变化、声明撤回、声明重新出现和插件销毁时保持成组。

Web bundle 同时包含 `@deepseek-ai/dsh-client-ui-brand-official` 与 `@deepseek-ai/dsh-client-ui-brand-thunderuni`。两个包分别由自己的 profile 控制 occupant，因此 `official` profile 保留上游品牌，`thunderuni` profile 激活 ThunderUni。新增的 `build:thunderuni` 命令复用现有完整构建流水线，并在仓库版本与 commit 元数据之外发布 `DSH_CLIENT_BUILD_PROFILE=thunderuni` 和 `DSH_CLIENT_TITLE=ThunderUni`。Desktop 打包接受相同的 `--profile official|thunderuni` 选择，把它同时传给完整客户端构建和 dsh 发布产物校验器，并继续以 `official` 为默认值。

浏览器默认值和 generic local-build fallback 文案统一使用 ThunderUni，包括文档标题、PWA manifest、启动页和由 locale 管理的 sidebar fallback。这个包和 profile 不新增服务端 URL、模型可见文本、agent-loop 行为、session event、权限、sandbox 策略或 KV cache 行为。

## Verification

ThunderUni 包和构建环境测试通过。Host 与 aggregate Client TypeScript 构建通过。GUI、依赖、客户端包、客户端 i18n、生成目录、translation pairing、README 和 constraints 检查通过。完整 `official` 构建及其无密钥 built Web smoke 通过，完整 `thunderuni` 构建记录了 ThunderUni profile，并生成标题为 ThunderUni 的 Web 产物。带 profile 的 Desktop preparation 也完成了 ThunderUni 客户端 tarball、runtime 与 package-set 准备，但因本机没有 codesigning identity 在 macOS runtime 签名处停止。最终无密钥 built-boot 与 PWA smoke 通过；签名安装器、公证、真实 API、部署和严格 UAT 仍不属于本决策的验证范围。

## Alternatives considered

**在 Web roster 中直接替换官方品牌包。** 否决，因为这会移除上游 `official` profile，使兼容性验证不再明确。保留两个包并由 profile 控制 occupant，可以同时保留两条构建路径。

**重命名 `dsh` 启动器或修改核心 runtime。** 否决，因为所需的产品身份属于浏览器客户端。重命名或修改启动器会扩大兼容性和发布范围，却不会改善品牌化的 Web 体验。

**在 JSX 和样式中硬编码 ThunderUni。** 否决，因为客户端 UI 文案由 locale 管理，仓库的 i18n gate 要求产品文本经过 typed dictionary 或 localized props。标记使用独立几何图形，wordmark 则来自包自己的 locale namespace 和 CSS module。

**为品牌客户端增加新的服务端或模型请求路径。** 否决，因为品牌化不需要新的网络能力，也不应扩大请求面。

## Consequences

- fork 拥有明确的 `thunderuni` 客户端构建 profile，同时保留 `official`。
- Sidebar 品牌由独立包持有，支持声明感知、可撤销，并能随插件销毁而移除。
- 浏览器外壳文案和生成元数据统一标识 ThunderUni，而底层 runtime 与启动器 contract 保持不变。
- 最终 Web 构建依赖仓库原生构建流水线所使用的本地 Node 与 pnpm 环境；真实 API 和生产部署证据仍需单独验证。
