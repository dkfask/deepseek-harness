# 实操手册：为 ThunderUni Desktop 运行 Docker Sub2API 后端

[English](docker-web-local.md) | 中文

本手册只使用 Docker 运行 Sub2API 后端。ThunderUni Desktop 是客户端，通过发布的后端端口连接；这条路径不会构建或启动 Harness Web 前端。

## 1. 前置条件

安装 Docker Desktop 并启动 Linux engine。仓库根目录的 `Dockerfile` 只是对 Sub2API 服务端镜像的薄包装；PostgreSQL 和 Redis 仍由独立的 Compose 服务提供。

当前使用的部署目录是 `D:\projects\API\sub2api-deploy`。将其中的 `.env` 保留在本仓库之外，不要复制进 Docker 构建上下文。

## 2. 启动后端服务栈

在部署目录执行：

```powershell
Set-Location D:\projects\API\sub2api-deploy
docker compose up -d
docker compose ps
```

服务栈把 Sub2API 发布到 `127.0.0.1:8090`，PostgreSQL 和 Redis 只位于 Compose 私有网络。启动 Desktop 前等待三个服务都报告 `healthy`。

## 3. 可选的后端镜像包装

如果需要使用本地镜像名，可以在 Harness 检出目录构建根包装镜像：

```powershell
Set-Location D:\projects\deepseek-harness-sub2api
docker build --build-arg SUB2API_IMAGE=weishaw/sub2api:latest --tag thunderuni-sub2api-backend:local .
```

该包装镜像不包含源码检出、前端产物、凭据或配置。标准 Compose 部署仍是提供 PostgreSQL、Redis、健康检查和持久化数据的支持路径。

## 4. 启动 Desktop 客户端

使用 Desktop 打包命令生成的 ThunderUni 安装包或解包可执行文件。安装包内置 `http://127.0.0.1:8090`、Bearer 网关鉴权，以及构建时选择的 managed-key 分组等非敏感默认值。

```powershell
$env:DSH_DESKTOP_APP_ID = '<local-test-app-id>'
$env:DSH_SUB2API_MANAGED_KEY_GROUP_ID = '<deployment-group-id>'
pnpm run package:desktop:win:x64:unsigned -- --profile thunderuni
```

生成的安装包位于 `.desktop-build\targets\win-x64\unsigned-artifacts\`。不要把 access token、密码或 managed API Key 写入打包环境或受 Git 跟踪的文件。

## 5. 验证本地部署

打开 Desktop 前先检查后端健康接口：

```powershell
Invoke-WebRequest http://127.0.0.1:8090/health -UseBasicParsing
```

然后在 ThunderUni Desktop 的 Sub2API 账户区登录批准的测试账户，刷新账户和模型数据，并分别发送一次非流式和一次流式 Chat Completions 请求。只保留脱敏后的状态和错误证据。

本地 Docker 栈只证明后端可用。账户凭据、API Key 值和 Desktop 用户数据都保留在本机测试环境中。

## 进一步阅读

关于协议、兼容性证据和 Windows 验收边界，请阅读 [Sub2API Windows 测试交接文档](sub2api-windows-test-handoff.zh.md)。
