---
description: "Sub2API 账户、用量、模型与经校验充值入口的浏览器设置区。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-sub2api

[English](README.md) | 中文

## 概述

`dsh-client-ui-settings-sub2api` 为 dsh Web 设置界面增加 Sub2API 账户区和登录后的身份卡片。它通过 `sub2api` Remote namespace 提交登录、注册和双重验证表单，只渲染 Host 提供的账户、余额、用量、模型、新鲜度、托管 API Key 元数据和稳定错误投影，并在不存储或显示任何凭据值的前提下打开经校验的充值 URL。

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

在同时挂载 `dsh-api-remotes`、`dsh-client-ui-settings` 和 Host 侧 Sub2API service 的 Web 组合中挂载浏览器入口。本包注册一个名为 `sub2api` 的 `settings.section` 条目，并在 `settings.sub2api` 下提供英文和简体中文词典。

退出登录视图只有在部署公开设置允许注册时才提供注册；没有公开设置 endpoint 的 profile 保留原有的 endpoint 驱动行为。服务端声明双重验证挑战后，页面切换到短时验证码表单。登录成功后，侧边栏底部会在现有设置入口旁显示安全的显示名或邮箱前缀。已认证视图展示安全账户身份、余额、用量、模型数量、托管 Key 名称、命名分组和可用的指纹、过期状态与刷新动作；模型设置入口打开现有“模型”页面，其中会显示已认证 ThunderUni/Sub2API 提供方卡片，概览托管 Key、命名分组、端点类型和已发现模型，同时保留现有自定义模型管理能力。托管 Key 的分组可以通过后端返回的用户可用分组下拉菜单直接在此处修改，Host 会带认证提交修改、在本地保留 secret、持久化新分组并刷新模型目录。每个已发现模型还可以编辑上下文窗口；保存后由 Host 持久化到 `sub2api-models` 设置命名空间，并应用到动态 provider profile。当部署自有模型目录时，该页面隐藏默认 DeepSeek 提供方行，只展示部署提供的用户模型。只有在支付或订阅能力已启用且没有禁用余额充值时才显示计费动作。密码和一次性验证码会在提交后清除；页面不渲染 token、API Key secret、原始响应或认证 header。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本分区使用现有 `settings.section` slot，并通过一个浏览器侧小型 wrapper 接收 `ctx.remote.sub2api` 动作。同一个 wrapper 还注册 `sidebar.footer.action` 身份卡片。Host 状态变化通过转发的 `sub2api/state-changed` 事件到达，因此底部卡片和账户页会一起更新，无需轮询。

浏览器把 Remote 失败当作稳定错误码，并从本包词典选择本地化文案，不检查或重建 Remote 错误正文。Host 在发布账户状态前会移除托管 API Key secret；浏览器只接收可展示的元数据。公开能力设置通过 Host Remote 读取；未知设置会对注册和计费控件 fail-closed。充值按钮只接受 Host 返回且已经通过 profile scheme、origin 和 redirect 策略校验的 URL。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Sub2API Host service](../../experimental/sub2api/README.zh.md)——生命周期、凭据所有权、模型 route、Remote 方法和 fixture。
- [Remote gateway](../../api/remotes/README.zh.md)——生成的 Host/Client 传输与事件转发策略。
- [设置区 seam](../ui-settings/README.zh.md)——slot 所有者和设置导航契约。
- [客户端 locale](../locale/README.zh.md)——浏览器词典注册与 locale 解析。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端账户设置投影，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **不拥有凭据**——浏览器从不读取、存储或删除 Host 托管的 access token、refresh token 或 API Key secret；可以显示 Host 提供的 Key 名称、分组和指纹等非 secret 元数据。
- **没有协议默认值**——Host 必须提供已核验的部署 profile 和 Remote namespace；页面不推断 endpoint path、认证 header、模型能力或支付行为。
- **没有 Responses 或 tools 控件**——账户页不暴露未支持的模型能力；Host provider 仍负责 feature gating。
- **没有外部部署证据**——合成 fixture 状态只是测试输入，不能证明目标 Sub2API 部署兼容。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文</summary>

本包只运行在浏览器中。凭据和协议变更应留在 Host 包内，新增文案应留在 locale dictionary 中。

</details>

**运行时不变式：** 分区只接收不含 secret 的 Remote 状态和动作；任何浏览器自有状态都不包含凭据值。

不发布 runtime invariant companion，因为本分区只拥有由 effect 管理的浏览器注册项；凭据和生命周期状态仍由 Host runtime 唯一持有。
