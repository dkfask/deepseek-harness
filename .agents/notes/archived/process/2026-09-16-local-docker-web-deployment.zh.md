# Agent Note: Local Docker Web deployment

Status: implemented
Archived: 2026-09-17

[English](2026-09-16-local-docker-web-deployment.md) | 中文

## Problem

仓库需要一条可重复的本地容器路径来测试 Web profile，同时不能扩大 Web 监听范围，也不能把本地凭据复制进镜像。

## Decision

仓库提供根目录 `Dockerfile` 用于本地 Web 部署。镜像使用 Node 24，安装 pnpm `11.7.0`，按冻结的 workspace 安装依赖，并在构建镜像时运行 `pnpm run build:thunderuni`，使本地镜像携带 ThunderUni 客户端 profile。

运行时使用 `node` 用户，把 profile 状态保存到 `/home/node/.dsh`，并由代理启动 `pnpm dsh --profile web --port 3080 --no-open`。

容器会在内部端口 `3081` 启动 TCP 代理，本地测试命令只把宿主回环端口 `3080` 发布到该代理。代理再转发到容器回环端口 `3080` 的 Web CLI，因此 Web CLI 保持仅回环监听，因为它拒绝 `0.0.0.0`。

构建上下文会排除 Git 元数据、宿主依赖树、构建输出、环境文件、npm 配置和桌面安装包。镜像会自行安装依赖并生成构建输出。由于 worktree 的 Git 指针不能在容器内使用，宿主机会通过构建参数传入源代码 commit。运行时凭据仍由进程环境传入，不会复制到镜像。

## Alternatives considered

**把 Web 监听绑定到 `0.0.0.0`。** Web CLI 会拒绝该地址，因此容器路径保持现有的仅回环策略。

**使用 host 网络。** Docker Desktop on Windows 不能可靠地把 Linux 容器的回环监听暴露给 Windows 主机，因此镜像使用 TCP 代理和仅回环的发布端口。

**把 `.env` 或凭据复制到镜像。** 这样会让密钥进入镜像层；运行时注入环境变量可以让凭据留在镜像之外。

## Consequences

本地 Docker 测试依赖支持 Linux 容器回环端口发布的 Docker engine。该镜像明确用于开发和验证，不宣称生产加固配置，也不会在没有明确审核 overlay 的情况下启用 Sub2API。
