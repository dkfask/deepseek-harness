# Agent Note：使桌面端运行时冒烟检查匹配原生锁迁移

状态：已实现

[English](2026-09-16-desktop-runtime-smoke-native-migration.md) | 中文

## 问题

会话持久化已经将 POSIX 锁实现迁移到 `@deepseek-ai/node-addon-system`，但桌面端运行时冒烟检查仍然要求 `fs-ext`。当前桌面端依赖闭包不包含 `fs-ext`，因此 Windows 打包在运行时准备阶段失败，甚至不会进入 electron-builder。

## 决策

运行时冒烟检查改为验证当前 `@deepseek-ai/node-addon-system/flock` 入口在 Windows 上可以解析，同时不会提前加载 POSIX 原生绑定。现有的 Koffi、node-pty、Sharp 和 HTML 检查继续验证桌面端实际使用的 Windows 运行时依赖。随之删除过时的 `fs-ext` 构建权限、文件过滤规则及对应夹具。

## 备选方案

**仅为冒烟检查重新加入 `fs-ext`。** 不采用，因为产品已经不声明或加载该包；重新加入会增加运行时体积，并掩盖过期测试，而不是检查实际发布的依赖图。

**在 Windows 上调用 POSIX flock 绑定。** 不采用，因为该原生入口会明确拒绝不支持的平台。Windows 会话所有权使用基于 Koffi 的内核句柄实现。

## 影响

Windows 桌面端打包现在验证当前原生依赖图，并可在没有无关 `fs-ext` 安装的情况下继续执行 electron-builder。POSIX flock 行为仍由受支持 POSIX 主机上的 native-system 和 session-persistence 测试套件覆盖。
