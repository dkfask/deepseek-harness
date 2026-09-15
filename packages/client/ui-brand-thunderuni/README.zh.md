---
description: "ThunderUni Web 客户端侧栏品牌 slot 填充与 thunderuni 构建 profile。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-thunderuni

[English](README.md) | 中文

## 概述

本包为 Web 客户端侧栏提供 ThunderUni 标志与本地化名称。浏览器插件仅在 `DSH_CLIENT_BUILD_PROFILE` 为 `thunderuni` 时注册两个标准品牌 slot；其他 profile 保留自己的填充或侧栏回退。本包只负责呈现，不改变 agent 请求、权限、模型、会话或网络行为。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Web bundle 同时包含本包与官方品牌包。运行 `pnpm run build:thunderuni` 构建私有品牌客户端；该构建设置 `DSH_CLIENT_BUILD_PROFILE=thunderuni` 与 `DSH_CLIENT_TITLE=ThunderUni`。现有的 `pnpm run build:official` 仍可用，并且只激活官方填充。

本包拥有 `thunderuni` locale 命名空间，并提供英文与简体中文词典。侧栏本地化名称接收标准类型化 `t` seat；几何标志是独立 SVG，不复用官方素材。

-----

<a id="understand-the-implementation"></a>
## 理解实现

浏览器半部等待 `sidebar.brand.mark` 与 `sidebar.brand.name` 两个声明后再注册一组填充。声明收回时两个填充一起撤回，插件销毁时 locale 词典与活动 slot 注册也一并移除。Host 半部为空，因为本包没有服务端行为。

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明并渲染侧栏品牌 slot。
- [ui-brand-official](../ui-brand-official/README.zh.md)——说明互斥的官方品牌 profile。
- [Client locale](../locale/README.zh.md)——负责带类型的浏览器词典与 `t` seat。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只渲染浏览器外壳，不发送模型可见文本或请求。

#### KV Cache 影响

无；本包不参与模型请求组装。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅替换侧栏身份**——本包不替换对话首屏 artwork 或服务端产品文案。
- **标题在构建时确定**——浏览器文档标题由 `DSH_CLIENT_TITLE` 选择，不由 slot registry 管理。

<a id="dev-note"></a>
### 开发备注

本包保持与上游 `dsh` 启动器及运行时 profile 兼容。品牌选择属于客户端构建配置，不属于运行时权限或模型配置。
