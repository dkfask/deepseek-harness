# Agent Note: Bind the ThunderUni Desktop package to the local Sub2API runtime

Status: implemented

English | [中文](2026-09-17-thunderuni-desktop-sub2api-runtime-defaults.zh.md)

## Problem

The ThunderUni client profile changed browser-visible branding but did not change the packaged Electron shell or Host environment. A user who started the local Sub2API deployment still had to set process variables manually, and the installer retained the DeepSeek Harness product identity.

## Decision

Desktop packaging writes a non-secret `desktop-runtime-config.json` resource for every target. The ThunderUni profile selects the `ThunderUni` product and artifact identity and embeds local Sub2API defaults, including Bearer gateway authentication, the configured positive managed-key group ID, the verified Chat Completions and streaming gates, and the verified tool-capability model allowlist. Packaging rejects the ThunderUni profile when `DSH_SUB2API_MANAGED_KEY_GROUP_ID` is absent or invalid. The Electron shell merges those defaults into the Host child environment, while launch-time values override them. The official profile keeps the existing product identity and an empty default environment.

## Alternatives considered

**Enable Sub2API in the shared base patch.** Rejected because CLI, Web, and official Desktop profiles must remain dormant unless their deployment explicitly opts in.

**Persist Sub2API credentials in the package.** Rejected because the package is distributed software; users must authenticate through the Desktop settings flow and credentials remain in the managed credential store.

**Infer the profile from the browser title at runtime.** Rejected because the shell and Host must use one immutable packaging decision, independent of renderer text or later client asset changes.

## Consequences

The ThunderUni installer launches with the local Sub2API integration ready for `127.0.0.1:8090` and keeps the backend opt-in isolated to that profile. The package contains no API key or password, but its build must name the deployment's managed-key group. Rebuilding the target is required when profile defaults or shell branding change.
