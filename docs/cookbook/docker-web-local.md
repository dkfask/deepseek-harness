# Cookbook: run the Sub2API backend for ThunderUni Desktop

English | [中文](docker-web-local.zh.md)

This cookbook runs only the Sub2API backend in Docker. The ThunderUni Desktop application is the client and connects to the published backend port; this path does not build or start the Harness Web frontend.

## 1. Prerequisites

Install Docker Desktop with a running Linux engine. The repository's root `Dockerfile` is a thin wrapper around the Sub2API server image; PostgreSQL and Redis remain separate Compose services.

The checked deployment directory is `D:\projects\API\sub2api-deploy`. Keep its `.env` outside this repository and never copy it into a Docker build context.

## 2. Start the backend stack

From the deployment directory, run:

```powershell
Set-Location D:\projects\API\sub2api-deploy
docker compose up -d
docker compose ps
```

The stack publishes Sub2API on `127.0.0.1:8090`, with PostgreSQL and Redis kept on the private Compose network. Wait until all three services report `healthy` before starting Desktop.

## 3. Optional backend image wrapper

When a local image name is useful, build the root wrapper from the Harness checkout:

```powershell
Set-Location D:\projects\deepseek-harness-sub2api
docker build --build-arg SUB2API_IMAGE=weishaw/sub2api:latest --tag thunderuni-sub2api-backend:local .
```

The wrapper contains no source checkout, frontend artifacts, credentials, or configuration. The normal Compose deployment remains the supported way to provide PostgreSQL, Redis, health checks, and persistent data.

## 4. Start the Desktop client

Use the ThunderUni installer or unpacked executable produced by the Desktop packaging command. The package embeds non-secret defaults for `http://127.0.0.1:8090`, Bearer gateway authentication, and the managed-key group selected at build time.

```powershell
$env:DSH_DESKTOP_APP_ID = '<local-test-app-id>'
$env:DSH_SUB2API_MANAGED_KEY_GROUP_ID = '<deployment-group-id>'
pnpm run package:desktop:win:x64:unsigned -- --profile thunderuni
```

The resulting installer is written below `.desktop-build\targets\win-x64\unsigned-artifacts\`. Do not put an access token, password, or managed API Key in the package environment or tracked files.

## 5. Verify the local deployment

Check the backend health endpoint before opening Desktop:

```powershell
Invoke-WebRequest http://127.0.0.1:8090/health -UseBasicParsing
```

Then open the Sub2API account section in ThunderUni Desktop, log in with an approved test account, refresh the account and model data, and send one non-streaming and one streaming Chat Completions request. Retain only redacted status and error evidence.

The local Docker stack proves backend availability only. Account credentials, API Key values, and Desktop user data remain local to the test machine.

## Further reading

For the protocol, compatibility evidence, and Windows acceptance boundary, read [the Sub2API Windows test handoff](sub2api-windows-test-handoff.md).
