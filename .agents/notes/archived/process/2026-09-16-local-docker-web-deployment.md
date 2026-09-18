# Agent Note: Local Docker Web deployment

Status: implemented
Archived: 2026-09-17

English | [中文](2026-09-16-local-docker-web-deployment.zh.md)

## Problem

The repository needs a repeatable local container path for testing the Web profile without widening the Web listener or copying local credentials into an image.

## Decision

The repository provides a root `Dockerfile` for local Web deployment. The image uses Node 24, installs pnpm `11.7.0`, installs the frozen workspace, and runs `pnpm run build:thunderuni` during the image build so the local image carries the ThunderUni client profile.

The runtime uses the `node` user, stores profile state under `/home/node/.dsh`, and the proxy launches `pnpm dsh --profile web --port 3080 --no-open`.

The container starts a TCP proxy on internal port `3081` and the local test command publishes only host loopback port `3080` to that proxy. The proxy forwards to the Web CLI on container loopback port `3080`, so the Web CLI keeps its loopback-only listener because it rejects `0.0.0.0`.

The build context excludes Git metadata, host dependency trees, build outputs, environment files, npm configuration, and desktop installers. The image installs its own dependencies and build outputs. The host supplies the source commit as a build argument because a worktree's Git pointer is not usable inside the container. Runtime credentials remain process environment inputs and are never copied into the image.

## Alternatives considered

**Bind the Web listener to `0.0.0.0`.** The Web CLI rejects this address, so the container path preserves the existing loopback policy.

**Use host networking.** Docker Desktop on Windows does not reliably expose a Linux container's loopback listener to the Windows host, so the image uses a TCP proxy with a loopback-only published port.

**Copy `.env` or credentials into the image.** This would make secrets part of an image layer; runtime environment injection keeps ownership outside the image.

## Consequences

Local Docker testing depends on a Docker engine that supports loopback-only port publishing for the Linux container. The image is intentionally a development and verification image; it does not claim a production hardening profile or enable Sub2API without an explicitly reviewed overlay.
