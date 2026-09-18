# Agent Note：Desktop runtime 固定完整的 OpenTelemetry resources 包

状态：已实现

[English](2026-09-17-desktop-runtime-otel-resources-pin.md) | 中文

## 问题

Desktop 生产 runtime 会根据已发布包清单重新生成依赖锁文件。`@opentelemetry/resources` 使用版本范围时解析到了 2.11.0，但该版本的 CommonJS host detector 引用了 `build/src/detectors/platform/node/machine-id/getMachineId`，而已发布包中缺少这个文件，导致 session telemetry 插件阻止 bundled Host 加载。

## 决策

`@deepseek-ai/dsh-session-telemetry-otel` 依赖已验证完整的 `@opentelemetry/resources` 2.10.0。Desktop runtime 因此会安装 workspace lockfile 中记录的同一版本，不会在准备包时解析到更新的版本范围。

## 考虑过的替代方案

**保留 semver 范围并接受最新版本。** 否决，因为 Desktop 启动必须验证确切的已发布 runtime 树，而所选版本无法在 Host 的 CommonJS 路径上执行。

**在 Desktop 输出中修补已安装的 OpenTelemetry 包。** 否决，因为这会生成未跟踪的依赖分支，使开发、打包和用户 profile 修复之间产生差异。

**在 Desktop profile 中禁用 session telemetry。** 否决，因为 telemetry 属于已发布的 base composition；移除它会掩盖损坏的依赖，而不是保留已配置的插件树。

## 结果

打包后的 Desktop Host 可以在 Windows x64 上加载 session telemetry 插件，此依赖的后续包准备过程也具有确定性。更新 OpenTelemetry resources 版本前，必须执行有针对性的 runtime smoke，导入 CommonJS 入口并启动打包后的 Host。

## 验证

问题已在已安装的 Windows x64 包中复现：启动页报告缺少 `machine-id/getMachineId` 模块。`pnpm run typecheck` 以及 Desktop 和 telemetry 定向 Vitest 均通过。重建后的短路径 Windows x64 包在 `dsh-session-telemetry-otel` 下实际包含 `@opentelemetry/resources` 2.10.0 和 machine-id detector，安装后没有缺失源文件，并且可以进入 ThunderUni 页面和 Sub2API 账户设置页。
