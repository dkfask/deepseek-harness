# Agent Note: Local Docker Sub2API backend for Desktop

Status: implemented

[English](2026-09-17-local-docker-sub2api-backend.md) | 中文

## Problem

本地验证需要一个由 Docker 托管的 Sub2API 服务端，同时产品客户端是带品牌的 ThunderUni Desktop。把 Harness Web profile 一起放进同一个容器会增加未请求的客户端表层，也会混淆哪个进程负责实际接入。

## Decision

仓库根目录的 `Dockerfile` 是对 `weishaw/sub2api:latest` 服务端镜像的薄包装，只暴露后端端口。支持的本地服务栈仍是独立的 Compose 部署，其中运行 Sub2API、PostgreSQL 和 Redis；其环境文件和持久化数据留在 Harness 镜像上下文之外。

ThunderUni Desktop 单独打包和启动。它的不可变运行时资源提供非敏感的本地后端 origin、Bearer 网关鉴权和构建时选择的 managed-key 分组。该 Docker 工作流不会构建或启动 Harness Web 前端。

## Alternatives considered

**在 Docker 中运行 Harness Web profile。** 否决，因为请求的产品表层是 Desktop，额外的 Web 进程会改变本地部署范围。

**把 Sub2API 服务端源码复制进 Harness 镜像。** 否决，因为本仓库不拥有服务端源码；上游服务端镜像及其 Compose 依赖才是部署依据。

**把凭据写入 Dockerfile 或镜像。** 否决，因为密码、token、API Key 和部署密钥必须保留为由部署环境持有的运行时输入。

## Consequences

后端与 Desktop 客户端可以分别验证，同时共享 `127.0.0.1:8090`。单独构建 Docker 包装镜像不会提供 PostgreSQL 或 Redis；完整本地后端必须使用 Compose 部署。Desktop 打包仍要求正整数 managed-key 分组 ID，但不会把任何 secret 封入产物。
