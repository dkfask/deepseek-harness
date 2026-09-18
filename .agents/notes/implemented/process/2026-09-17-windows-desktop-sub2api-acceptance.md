# Agent Note: Windows Desktop Sub2API local acceptance

Status: implemented

English | [中文](2026-09-17-windows-desktop-sub2api-acceptance.zh.md)

## Problem

The Windows handoff needed evidence that the branded Desktop package could use the Docker Sub2API backend without starting a Harness Web frontend. The earlier handoff recorded only package and launch smoke and did not distinguish completed local evidence from capabilities that still require independent deployment review.

## Decision

Treat the local acceptance path as three separate observations: the locked upstream source revision, the Docker backend plus deterministic test upstream, and the final unsigned ThunderUni Desktop package. Record only the fields and outcomes observed through those paths. The reviewed redacted target record and source comparison promote 12 matching P0 rows to `verified`; the current-user decoder accepts the target's empty optional username and the Desktop UI projects its balance, while balance recovery and the remaining rows stay `not-provided` until their complete baseline and target contract is exercised. Responses and other unverified model capabilities remain disabled.

## Alternatives considered

**Mark every P0 row verified after the local chat request.** Rejected because a successful model request does not prove registration, 2FA, recharge, SSRF, all error classes, or the Responses event contract.

**Use the Desktop UI as the only protocol evidence.** Rejected because the Host runtime owns tokens, managed Keys, gateway requests, and redacted state; UI success alone cannot replace the source and target observations for those seams.

**Leave the Windows handoff unchanged.** Rejected because it claimed installation, Settings navigation, and uninstall were still pending after those operations had completed.

## Consequences

The local workflow now has a reproducible acceptance record for Docker health, Host account and gateway behavior, and the branded Desktop UI. The record does not authorize production deployment, signing, or compatibility-matrix promotion. Temporary test users and generated Keys are deleted after each probe; the pre-existing local fixture account and group remain available for repeatable Docker tests.

## Verification

- The locked baseline source was checked out at `881f3202694c6bc932446931a30c27d9675178b9`.
- The reviewed target observations are stored in `packages/experimental/sub2api/tests/fixtures/target-local-0.2.5-v1.json`; they contain request paths, statuses, response field names, counts, and stream termination only.
- `docker compose ps` in `D:\projects\API\sub2api-deploy` reported healthy Sub2API, PostgreSQL, and Redis containers.
- A temporary user completed login, refresh-token rotation, current-user, usage-dashboard, managed-Key creation, model discovery, non-streaming Chat Completions, streaming Chat Completions, and SSE termination through the local Docker target. Secrets were not recorded.
- The final ThunderUni unsigned x64 installer was built, launched from the unpacked artifact, opened the Sub2API Settings section, logged in, projected a numeric balance, refreshed usage and 17 models without an error alert, selected a Sub2API model, and completed a streaming Chat Completions request through the local gateway. No application process remained after cleanup.
- The latest repack includes the locked deployment's `verify_code` registration field mapping and managed-Key group binding; the focused Sub2API and Loader composition tests passed 44/44 after these corrections, including the locked registration, TOTP field-name, same-name cross-group, wrong-group response, and public-settings cache regressions.
- The shared base profile exposes `DSH_SUB2API_TOOLS_ENABLED` as an explicit opt-in, and the ThunderUni package seals it to `false`; no target tool fixture exists, so the tools capability remains fail-closed.
- Managed-Key reconciliation now records and enforces the configured `group_id`; a same-named key from another group is ignored, and a create response for the wrong group fails closed. The target probe confirmed that `/keys` list items and create responses expose `group_id`.
- The target's unauthenticated `/api/v1/settings/public` response exposed `registration_enabled=false`, `payment_enabled=false`, `payment_balance_disabled=false`, and empty recharge URL fields. The Host runtime reads these settings without credentials, and the Desktop settings section hides registration and billing controls when the deployment does not enable them.
- The latest unsigned installer is 180,174,014 bytes. Its embedded runtime payload keeps the ThunderUni profile, local account and gateway URLs, managed-Key group `5`, bearer gateway authentication, and tools disabled; the packaged base patch contains the public-settings endpoint and explicit cache setting, and the Sub2API bundle contains the public-settings decoder and group binding.
- Focused source checks passed: the four-file Desktop/Sub2API test selection passed 57/57, typecheck completed, the ThunderUni unsigned x64 package was rebuilt, its sealed runtime configuration was inspected, Docker health was rechecked, and Agent Note/package README/bilingual-pair checks passed. The repository still has the two pre-existing translation-pairing failures recorded in the handoff.
- The compatibility matrix records 12 P0 capabilities as `verified` from the reviewed source and target observations; registration, 2FA, balance recovery, HTTP error classes, SSRF deployment behavior, recharge URL, Responses, and tools remain unverified.
