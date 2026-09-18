# Agent Note：将 ThunderUni 桌面端绑定到本地 Sub2API 运行时

状态：已实现

[English](2026-09-17-thunderuni-desktop-sub2api-runtime-defaults.md) | 中文

## 问题

ThunderUni 客户端 profile 只改变了浏览器可见品牌，没有改变打包后的 Electron 壳或 Host 环境。用户启动本地 Sub2API 部署后仍需手动设置进程变量，安装包也仍然使用 DeepSeek Harness 产品身份。

## 决策

桌面端打包为每个目标生成不含敏感信息的 `desktop-runtime-config.json` 资源。ThunderUni profile 选择 `ThunderUni` 产品名和产物名，并写入本地 Sub2API 默认值，包括 Bearer 网关鉴权、已配置的正整数 managed-key 分组 ID、已经验证的 Chat Completions 与流式能力开关，以及已经验证的工具能力模型白名单。缺少或无效的 `DSH_SUB2API_MANAGED_KEY_GROUP_ID` 时，打包会拒绝 ThunderUni profile。Electron 壳把这些默认值合并到 Host 子进程环境，启动时的环境变量优先。official profile 保留现有产品身份，并使用空的默认环境。

## 备选方案

**在共享 base patch 中开启 Sub2API。** 不采用，因为 CLI、Web 和 official Desktop profile 必须继续保持休眠，除非各自的部署显式选择开启。

**把 Sub2API 凭据持久化到安装包。** 不采用，因为安装包是分发软件；用户必须通过桌面端设置流程认证，凭据继续保存在受管理的凭据存储中。

**运行时根据浏览器标题推断 profile。** 不采用，因为壳和 Host 必须共享不可变的打包决策，不应依赖渲染器文本或后续客户端资源变化。

## 影响

ThunderUni 安装包启动后即可为 `127.0.0.1:8090` 准备本地 Sub2API 接入，同时只在该 profile 中开启后端。安装包不包含 API Key 或密码，但打包时必须指定部署使用的 managed-key 分组。profile 默认值或壳品牌变化后必须重新打包目标。
