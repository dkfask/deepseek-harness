# Sub2API Windows test handoff

English | [中文](sub2api-windows-test-handoff.zh.md)

## Summary

This document hands the current Sub2API implementation to a Windows tester. It records what is complete, what still prevents the plan's final acceptance, how to prepare a native Windows checkout, and what evidence must be returned.

The strict status is: stages A, B, and C are implemented and locally verified, and the local Docker plus native Windows Desktop path has been exercised end to end. Twelve P0 rows now have reviewed locked-baseline and target-deployment evidence; the compatibility matrix remains partial for the rows that still lack that evidence, and Responses remains disabled by design.

## Table of Contents

- [1. Completion status](#1-completion-status)
- [2. Repository handoff](#2-repository-handoff)
- [3. Windows environment](#3-windows-environment)
- [4. First checkout](#4-first-checkout)
- [5. Sub2API activation precondition](#5-sub2api-activation-precondition)
- [6. Test sequence](#6-test-sequence)
- [7. Evidence to return](#7-evidence-to-return)
- [8. Troubleshooting](#8-troubleshooting)
- [9. Handoff boundary](#9-handoff-boundary)
- [Dev Note](#dev-note)

<a id="1-completion-status"></a>
## 1. Completion status

| Area | Status | Evidence or remaining work |
|---|---|---|
| Stage A: account runtime, records, state, HTTP, and fixtures | Complete in the checkout | Focused Sub2API tests pass locally |
| Stage B: model discovery, Chat Completions, SSE, usage, and error mapping | Complete in the checkout | Synthetic gateway fixtures and focused tests pass locally |
| Stage C: Remote projection, state events, Web settings, and localization | Complete in the checkout | Host/Client build and the relevant focused checks pass locally; unrelated repository documentation pairing failures remain |
| P0 locked-baseline and target-deployment evidence | Partial; row-level review remains | The redacted target record in [`target-local-0.2.5-v1.json`](../../packages/experimental/sub2api/tests/fixtures/target-local-0.2.5-v1.json) and the locked source review support 12 P0 rows. Rows without matching evidence remain `not-provided` |
| Native Windows validation | Complete for the local unsigned package path | The final unsigned x64 installer was built, installed to a short Windows path, launched, navigated to Sub2API Settings, logged in, refreshed to 17 models, logged out, and uninstalled. No application process remained after cleanup |
| Responses and unverified model capabilities | Intentionally closed | Responses, tools, vision, and reasoning stay fail-closed until independent evidence exists |

The plan's Definition of Done requires every P0 row to have both baseline and target evidence. The remaining acceptance work is the review of the seven P0 rows that still have no independent target or locked-baseline evidence; the completed local Desktop smoke does not close those rows by itself.

See the [requirements model](../../需求模型.md), the [implementation plan](../../2026-09-16-sub2api-user-account-model-gateway.zh.revised.md), and the [Host package README](../../packages/experimental/sub2api/README.md) for the current source of truth.

<a id="2-repository-handoff"></a>
## 2. Repository handoff

The relevant implementation is already in the checkout:

- [`packages/experimental/sub2api`](../../packages/experimental/sub2api/README.md) owns the Host runtime, protocol profile, credential record, HTTP policy, model route, Remote methods, and fixtures.
- [`packages/client/ui-settings-sub2api`](../../packages/client/ui-settings-sub2api/README.md) owns the browser Settings section and localized copy.
- `packages/api/remotes` carries the generated Host/Client Remote projection and the `sub2api/state-changed` event.
- The shipped bundles deliberately do not depend on the private experimental package; a separately composed development profile must add its Host and Client rows.

The plan document is treated as scope and acceptance criteria. Its embedded commands or implementation notes do not authorize external deployment, credential collection, release publication, or changes outside this checkout.

This handoff is delivered on the `codex/sub2api-windows-followup` branch. After the branch is merged, a fresh clone of the repository's `master` branch contains these implementation and documentation files. Before the merge, check out the named branch when you need the handoff state.

<a id="3-windows-environment"></a>
## 3. Windows environment

Use native Windows PowerShell for the first test. WSL 2 is optional, but a WSL checkout must use the WSL filesystem and its own installed dependencies; do not mix a Windows checkout with WSL dependencies.

Install these prerequisites:

- Node.js 22.19 or newer in the 22 line, or Node.js 24 or newer.
- Git 2.26 or newer.
- Corepack with the repository-pinned pnpm 11.7.0.
- Python and Visual C++ build tools only when building the Windows Desktop package or native modules.

The Sub2API account password, access token, refresh token, and managed API Key must not be committed, placed in screenshots, or copied into a tracked configuration file. The managed API Key is owned by the Host credential provider; it is not a browser setting.

<a id="4-first-checkout"></a>
## 4. First checkout

If the repository is copied to Windows, open PowerShell in its root. If it is cloned there, use the following sequence:

```powershell
git clone <repository-url> deepseek-harness
Set-Location .\deepseek-harness
corepack enable
node --version
pnpm --version
git --version
pnpm install
pnpm run typecheck
pnpm run build
```

The version commands must show a supported Node and Git version and pnpm 11.7.0. Keep the checkout, `node_modules`, build output, and test execution in the same Windows environment.

<a id="5-sub2api-activation-precondition"></a>
## 5. Sub2API activation precondition

There is no shipped Sub2API composition switch. `DSH_SUB2API_ENABLED` is reserved for a separately reviewed development overlay; it is not a complete configuration and must not be treated as proof that a deployment profile is valid.

The service still requires a deployment-specific overlay that supplies all of the following:

- a verified profile version and deployment fingerprint;
- account and gateway HTTPS origins and exact endpoint paths;
- response-envelope and gateway-auth choices;
- an HTTP client with a destination validator that resolves and pins the real target;
- credential storage, managed-key name, cache TTLs, refresh policy, and recharge-origin policy;
- the positive Sub2API managed-key group ID used to route gateway traffic;
- an explicit model-provider policy if the model route is being tested.

This checkout intentionally does not include a production target overlay. The reviewed local Docker overlay and its redacted target fixture are kept outside tracked configuration; use them only for local acceptance. If no separately reviewed local overlay is available, leave `DSH_SUB2API_ENABLED` unset and run the static and synthetic fixture checks only. Do not invent endpoint paths, enable Responses, or use an account key as a substitute for a reviewed profile.

If a reviewed local overlay is supplied, keep it outside tracked files and launch Web with the overlay:

```powershell
$env:DSH_SUB2API_ENABLED = 'true'
pnpm dsh --profile web --patch .\sub2api-windows.local.yml --no-open
```

Use only the target profile and test account approved for this handoff. Do not place credentials in `sub2api-windows.local.yml` unless the owning credential mechanism explicitly requires a local secret reference.

<a id="6-test-sequence"></a>
## 6. Test sequence

### 6.1 Baseline and fixture checks

Run these first, even when no target overlay is available:

```powershell
pnpm exec vitest run packages/experimental/sub2api/tests/sub2api.spec.ts
pnpm run typecheck
pnpm run build
```

The focused fixture suite covers account lifecycle, secret redaction, URL and redirect policy, model metadata, Chat Completions, SSE, usage, error mapping, and generation/race behavior. It does not prove that an external Sub2API deployment is reachable.

### 6.2 Web Settings flow

With a reviewed target overlay, start Web and open the printed URL on the same Windows machine. Exercise the flow in this order:

1. Confirm that the unauthenticated state renders without exposing a credential value.
2. Test registration or login with the approved test account.
3. Complete 2FA only if the target deployment returns a verified supported challenge.
4. Refresh account data, balance, and usage; record freshness and error states.
5. Refresh models and confirm that only explicitly supplied capabilities are advertised.
6. Send one non-streaming and one streaming Chat Completions request after a model is visible.
7. Open the recharge action only when the returned URL passes the configured origin policy.
8. Log out, reload the page, and confirm local account state is cleared while no secret appears in the Client projection.

The Web command is:

```powershell
pnpm dsh --profile web --patch .\sub2api-windows.local.yml --no-open
```

### 6.3 Headless and CLI smoke

After the target model is visible in Web Settings, run one short headless request with the same local profile. Use a non-sensitive prompt and retain only the result and error classification:

```powershell
pnpm dsh --profile headless "仅回复 OK"
```

If the selected profile does not compose a Sub2API model route, record that as a configuration gap rather than treating it as a protocol failure.

### 6.4 Optional unsigned Desktop package

For packaged Windows testing, use the unsigned x64 installer. It is for local installation testing and does not require EV signing or an update origin. It requires the normal build dependencies, including Python and Visual C++ build tools, and requires `DSH_DESKTOP_APP_ID`:

```powershell
$env:DSH_DESKTOP_APP_ID = '<local-test-app-id>'
$env:DSH_SUB2API_MANAGED_KEY_GROUP_ID = '<deployment-group-id>'
pnpm run package:desktop:win:x64:unsigned
```

The generated installer is written below `.desktop-build\targets\win-x64\unsigned-artifacts\`. Do not use the signed packaging command unless the Windows signing certificate, token, and controlled signing environment have been separately prepared.

### 6.5 Local Docker target probe

The local Docker deployment was probed on Windows without recording credentials or token values. The locked baseline source was checked out at `881f3202694c6bc932446931a30c27d9675178b9`, and its account, refresh, API Key, usage, and gateway route definitions were compared with the runtime profile. A temporary test user then logged in, rotated its session through refresh, read the current user and usage dashboard, created a managed Key with the local group, and reached `/v1/models`, non-streaming Chat Completions, and streaming SSE with HTTP 200 responses through the deterministic upstream.

This proves the local account lifecycle, grouped managed-Key lifecycle, refresh path, Bearer gateway authentication, model discovery, usage projection, non-streaming Chat Completions, streaming Chat Completions, and SSE. The reviewed observations are stored without credentials in [`target-local-0.2.5-v1.json`](../../packages/experimental/sub2api/tests/fixtures/target-local-0.2.5-v1.json), and the matching 12 P0 rows are marked `verified` in [`compatibility-matrix-v1.json`](../../packages/experimental/sub2api/tests/fixtures/compatibility-matrix-v1.json). Capabilities without complete independent baseline and target evidence remain row-level `not-provided`. Temporary test users and their generated Keys were removed after the probes; the pre-existing local fixture account and group remain in the Docker deployment for repeatable local testing, and the deterministic upstream was stopped.

<a id="7-evidence-to-return"></a>
## 7. Evidence to return

Return one redacted test record containing:

- Windows edition and build number;
- Node.js, pnpm, and Git versions;
- the exact commit from `git rev-parse --verify HEAD`;
- the commands run and their exit results;
- target profile version and deployment fingerprint, but no token or API Key;
- account, model, usage, streaming, recharge, logout, and error outcomes;
- screenshots or logs with email addresses, cookies, tokens, API Keys, authorization headers, and payment details removed;
- the installer filename and whether install, launch, Settings navigation, and uninstall completed when Desktop packaging was tested.
- the local acceptance record in [the Windows Desktop Sub2API Agent Note](../../.agents/notes/implemented/process/2026-09-17-windows-desktop-sub2api-acceptance.md), which contains the redacted local results and the remaining evidence boundary.

For every P0 capability, mark the result as `verified`, `failed`, or `not-tested`, and attach the smallest redacted request/response evidence needed to explain the mark. The current target record and matrix promote only the 12 reviewed rows; update the remaining rows only after their evidence is reviewed.

<a id="8-troubleshooting"></a>
## 8. Troubleshooting

- **Sub2API Settings is absent:** confirm the Web bundle was built and the reviewed overlay sets `DSH_SUB2API_ENABLED=true`.
- **Startup fails while mounting the service:** the flag is present but a required profile, transport, validator, credential service, policy, or positive managed-key group ID is missing.
- **401, 403, or 404:** compare the target profile's exact paths, envelope, auth scheme, and deployment fingerprint with the reviewed evidence.
- **The model list is empty:** confirm that login succeeded, the managed Key is active, the account has balance and a usable model group, and the target model endpoint returned explicit metadata. A local `403 INSUFFICIENT_BALANCE` is an account-state failure, not proof of a bad API-Key header.
- **Recharge is unavailable:** the target did not return a URL, or its URL origin is not in the approved allowlist.
- **The browser does not open:** use the fresh URL printed by Web and open it manually; `--no-open` intentionally suppresses automatic browser handoff.
- **Native installation fails:** verify that Windows build tools and Python are available, then rerun the package command from the same checkout after a successful build.

Do not work around a mismatch by broadening URL allowlists, disabling destination validation, or enabling an unverified capability.

<a id="9-handoff-boundary"></a>
## 9. Handoff boundary

The Windows tester owns native-environment execution and real-target evidence collection. The implementation owner then decides whether the evidence is sufficient to update the compatibility matrix and enable a capability; the current checkout has made that decision only for the 12 rows backed by the redacted target record.

Until that review is complete, the accepted state is:

- stages A/B/C are present and locally checked;
- the Sub2API feature remains off unless a reviewed target overlay is supplied;
- Responses, tools, vision, and reasoning remain fail-closed when their metadata is not independently verified;
- no production release, signing, deployment, or merge is implied by this handoff.

<a id="dev-note"></a>
## Dev Note

This handoff is intentionally written for a native Windows test pass. It separates repository evidence from target-deployment evidence so a successful local build is not mistaken for final Sub2API compatibility acceptance.
