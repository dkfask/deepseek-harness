# Agent Note: Local Docker Sub2API backend for Desktop

Status: implemented

English | [中文](2026-09-17-local-docker-sub2api-backend.zh.md)

## Problem

Local validation needs a Docker-hosted Sub2API server while the product client is the branded ThunderUni Desktop application. Starting the Harness Web profile in the same container adds an unrequested client surface and obscures which process owns the integration.

## Decision

The repository root `Dockerfile` is a thin wrapper around the `weishaw/sub2api:latest` server image and exposes only the backend port. The supported local stack remains the separate Compose deployment with Sub2API, PostgreSQL, and Redis; its environment file and persistent data stay outside the Harness image context.

ThunderUni Desktop is packaged and launched separately. Its immutable runtime resource supplies the non-secret local backend origin, Bearer gateway authentication, and build-selected managed-key group. Docker does not build or start a Harness Web frontend for this workflow.

## Alternatives considered

**Run the Harness Web profile in Docker.** Rejected because the requested product surface is Desktop and the extra Web process changes the local deployment scope.

**Copy the Sub2API server source into the Harness image.** Rejected because this repository does not own the server source; the upstream server image and its Compose dependencies remain the deployment authority.

**Put credentials in the Dockerfile or image.** Rejected because passwords, tokens, API Keys, and deployment secrets must remain runtime inputs owned by the deployment environment.

## Consequences

The backend and Desktop client can be tested independently while sharing `127.0.0.1:8090`. A Docker build of the wrapper alone does not provide PostgreSQL or Redis; use the Compose deployment for a complete local backend. Desktop packaging still requires a positive managed-key group ID, but no secret is sealed into the artifact.
