# Agent Note: Sub2API locked authentication field mapping

Status: implemented

[English](2026-09-17-sub2api-locked-auth-fields.md) | 中文

## Problem

锁定的 Sub2API 基线注册时不要求 username，TOTP 登录则使用 `temp_token` 和 `totp_code` 完成。通用注册表单和使用另一套必填字段的 challenge 编码器，会导致 Host runtime 无法匹配基线协议。

## Decision

标准 Sub2API codec 发送注册所需的 `email`、`password` 和可选 `verify_code`，不要求或凭空生成 username。它解析锁定基线的 `temp_token` 以及兼容的 challenge 别名；标准 TOTP 提交发送 `temp_token` 和 `totp_code`。Remote 与 Desktop 表单只暴露标准 profile 所拥有的字段。

## Alternatives considered

**保留必填 username。** 否决，因为锁定基线没有该字段，Host 不应把未经核验的字段设为必填。

**保留通用的 `code` 和 `two_factor_token` wire 字段。** 否决，因为锁定基线 handler 绑定的是 `totp_code` 和 `temp_token`；对于不同且已核验的部署，仍可提供自定义 codec。

**静默转换所有可能的 captcha 字段。** 否决，因为 captcha provider proof 依赖具体部署；标准 codec 只发送已核验的邮箱验证码字段，其余 proof 映射交给经过审核的 codec。

## Consequences

标准注册和 TOTP 请求现在可以匹配基线，而不会泄露或持久化认证材料。需要额外注册 proof 的部署必须提供 profile 专用 codec 或返回明确的服务端错误；标准 Desktop 表单不会假装解决它无法核验的 captcha。
