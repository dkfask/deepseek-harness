# Agent Note：Sub2API 客户端类型入口不作为浏览器插件

状态：已实现

[English](2026-09-17-sub2api-client-type-face-not-plugin.md) | 中文

## 问题

`@deepseek-ai/dsh-experimental-sub2api` 保留 `./client`，用于导出给 `dsh-api-remotes` 使用的类型词汇；它不拥有浏览器运行时。将该入口声明到 `dsh.client` 后，客户端 Loader 会把仅类型模块当作 Cordis 插件，并在 ThunderUni UI 挂载前失败。

## 决策

移除 `@deepseek-ai/dsh-experimental-sub2api` 的 `dsh.client` 声明，同时保留 `./client` 导出。生成的 Sub2API Remote 贡献仍由 `dsh-api-remotes` 挂载，Sub2API 设置 UI 继续由自己的客户端包声明。

## 考虑过的替代方案

**为客户端类型入口添加空的 `apply` 安装器。** 否决，因为该模块不拥有浏览器运行时，空安装器会掩盖错误的包声明。

**移除 `./client` 导出。** 否决，因为 `dsh-api-remotes` 在组装生成的 Remote 客户端时使用该导出的类型词汇。

## 结果

客户端 Loader 图包含 Sub2API 设置 UI 和 Remote 装配，不再加载独立的 `@deepseek-ai/dsh-experimental-sub2api` 客户端插件。Host 侧 Sub2API 运行时代码和公开客户端类型入口仍然可用。

## 验证

短路径 Windows x64 桌面包已重新构建，浏览器启动可以进入 ThunderUni 应用，且不再出现 Sub2API 插件激活错误。启动图包含 `@deepseek-ai/dsh-client-ui-settings-sub2api` 和 `@deepseek-ai/dsh-api-remotes`，但不包含独立的 `@deepseek-ai/dsh-experimental-sub2api` 客户端条目。
