---
description: "Host-side Sub2API account, model-gateway, Remote, fixture, and lifecycle helpers with an opt-in provider route and secret-free projections."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-sub2api

English | [中文](README.zh.md)

## Summary

This library gives Host code an explicit Sub2API account runtime and an opt-in model route. Callers compose a deployment profile, validate a version-one grant, run login/refresh/API-Key reconciliation through a credential-store seam, produce secret-free state, and send bounded requests through an injected destination validator. `Sub2apiService` mounts the runtime through `ctx.credentials`, exposes the `sub2api` Remote namespace, and can register a dynamic `llm-pi-ai` route only when its feature flag is enabled. Base-backed profiles carry the same service row disabled by default; an explicit deployment environment enables it and supplies the target facts.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### When to use it

Use `Sub2apiRuntimeService` when a Host provider needs login, refresh, managed API-Key reconciliation, account/model/usage refresh, and recharge URL validation while keeping secrets separate from UI-safe state. Use `Sub2apiHttpClient` for bounded protocol requests after supplying a resolver that validates and pins the destination used by the actual connection. The standard codec is intentionally fixture-oriented: compose it only after its field and envelope choices are verified for the target deployment.

### Minimal configuration

```ts
import { resolveSub2apiProfile, parseSub2apiGrantRecord, redactSub2apiGrantRecord, Sub2apiHttpClient, type Sub2apiDestinationValidator } from '@deepseek-ai/dsh-experimental-sub2api'

const profile = resolveSub2apiProfile({
  version: 'verified-deployment-version',
  accountBaseUrl: 'https://account.example.test/api/v1',
  gatewayBaseUrl: 'https://gateway.example.test',
  accountPaths: { login: '/auth/login', register: '/auth/register', publicSettings: '/settings/public', me: '/auth/me', apiKeys: '/keys', groupsAvailable: '/groups/available' },
  gatewayPaths: { models: '/v1/models', chatCompletions: '/v1/chat/completions' },
})
const record = parseSub2apiGrantRecord(untrustedJson)
const safeState = redactSub2apiGrantRecord(record)

declare const untrustedJson: unknown

declare const resolveAndPinDestination: Sub2apiDestinationValidator
declare const accessToken: { readonly kind: 'access-token'; readonly value: string }

const client = new Sub2apiHttpClient({
  profile,
  maxResponseBytes: 1_000_000,
  timeoutMs: 15_000,
  maxRedirects: 2,
  validateDestination: resolveAndPinDestination,
})
const account = await client.request({ base: 'account', path: '/auth/me', method: 'GET', credential: accessToken })
```

The runtime accepts the same client plus a credential-store adapter. Its public state contains only account metadata, cache timestamps, models, usage, and stable errors; `resolveGatewayCredential` is the Host-only path that returns the managed Key snapshot for a model provider.

Set `persistRefreshToken` only for a deployment that intentionally supports local session recovery. When enabled, `hydrate` refreshes a matching stored grant during Host startup; the credential store receives the refresh token and managed Key, never the account password or access token.

When `accountPaths.publicSettings` is configured, `getPublicSettings` reads the unauthenticated deployment capability response without an access token and caches it for the explicit `cacheTtlMs.publicSettings` interval. When `accountPaths.groupsAvailable` is configured, `getAvailableGroups` reads the authenticated user's named groups and caches them for `cacheTtlMs.groups`; the browser uses these names for managed-Key group selection. The settings section treats registration and billing controls as unavailable unless the deployment reports them enabled; a profile without these optional endpoints retains its existing endpoint-driven behavior.

The Host registers the live `sub2api-models` settings namespace when a settings provider is present. Its model card can persist a context-window override for each discovered model; the override is applied to the secret-free descriptor and dynamic LLM profile, so the next request uses the configured capacity and the value survives restart. The runtime accepts only positive safe integer capacities, while the browser also accepts `K`, `M`, and `G` suffixes.

The Sub2API LLM route keeps tool calls disabled unless `toolsEnabled` is true and the model metadata marks the model as verified or its id appears in `verifiedToolsModels`. Base profiles expose the latter as the comma-separated `DSH_SUB2API_VERIFIED_TOOLS_MODELS` environment value, so a deployment can record a real tool-call probe for one model without inferring support for every unknown model.

The profile succeeds only for validated HTTPS or an exact development HTTP allowlist entry, safe hosts, and relative endpoint paths. The HTTP client adds JSON and verified authentication headers, revalidates same-origin redirect hops, bounds response bytes, honors cancellation and timeouts, and maps status failures without returning upstream error bodies. The record parser rejects unsupported or malformed durable values. The redacted projection contains account metadata and key metadata, never a refresh token or API Key secret. A runtime that creates the managed Key must provide a positive `managedKeyGroupId`; Sub2API uses that group to route gateway traffic. Managed-Key reconciliation records the selected `group_id`, ignores same-named keys from other groups, and rejects a create response that names the wrong group. An authenticated account owner can update the managed Key group through the user `PUT /keys/{id}` endpoint; the runtime persists the new group while retaining the Host-only secret and invalidates model discovery so the next gateway request uses the new route.

The Sub2API LLM route keeps tool calls disabled unless `toolsEnabled` is true and the model metadata marks the model as verified or its id appears in `verifiedToolsModels`. Base profiles expose the latter as the comma-separated `DSH_SUB2API_VERIFIED_TOOLS_MODELS` environment value, so a deployment can record a real tool-call probe for one model without inferring support for every unknown model.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package keeps protocol choices, durable-record parsing, secret branding, state transitions, and generation guards as separate pure modules. This lets later Host providers supply transport, storage, and lifecycle ownership without making the compatibility profile a hidden default.

| File | Role |
|---|---|
| [`src/profile.ts`](src/profile.ts) | Normalize deployment URLs and endpoint paths, select envelope/auth choices, and reject unsafe URL forms |
| [`src/http.ts`](src/http.ts) | Build bounded authenticated requests, validate redirect hops, cap response bodies, and map transport/status failures |
| [`src/protocol.ts`](src/protocol.ts) | Parse bounded JSON and select the configured direct or `data` response envelope |
| [`src/record.ts`](src/record.ts) | Parse version-one grants, brand secret values, and create secret-free projections |
| [`src/state.ts`](src/state.ts) | Apply allowed account lifecycle events and track monotone operation generations |
| [`src/service.ts`](src/service.ts) | Own Host login, refresh, account/model/usage caches, managed Key reconciliation, and recharge URL validation |
| [`src/cordis.ts`](src/cordis.ts) | Mount the runtime as `ctx.sub2api`, expose Remote methods, and register the shared authorization flow |
| [`src/llm.ts`](src/llm.ts) | Register the opt-in `sub2api` route over the shared `llm-pi-ai` Chat Completions/SSE adapter |
| [`src/remote.ts`](src/remote.ts) | Project account actions and state through a secret-free Typert Remote namespace |
| [`src/compatibility.ts`](src/compatibility.ts) | Parse the locked-baseline, target-deployment, and fixture evidence matrix plus redacted target observations |
| [`src/fixtures.ts`](src/fixtures.ts) | Parse and replay versioned business fixtures, then supply deterministic fetch and credential-store doubles for protocol and race tests |
| [`src/errors.ts`](src/errors.ts) | Define the stable Sub2API error taxonomy and redacted error summaries |
| [`src/types.ts`](src/types.ts) | Keep wire-safe and durable type declarations separate from runtime code |
| [`tests/fixtures/account-v1.json`](tests/fixtures/account-v1.json) | Synthetic request assertions and responses for the Host runtime replay path |
| [`tests/fixtures/gateway-v1.json`](tests/fixtures/gateway-v1.json) | Synthetic model-list, non-streaming Chat Completions, SSE, and usage exchanges |
| [`tests/fixtures/compatibility-matrix-v1.json`](tests/fixtures/compatibility-matrix-v1.json) | P0/P1 evidence rows that keep target deployment evidence separate from synthetic fixture status |
| [`tests/fixtures/target-local-0.2.5-v1.json`](tests/fixtures/target-local-0.2.5-v1.json) | Redacted observations from the local target; it records paths, statuses, field names, counts, and stream termination without secrets |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Sub2API account and model-gateway design model](../../../需求模型.md) — scope, state rules, compatibility matrix, and deferred provider work.
- [Sub2API implementation plan](../../../2026-09-16-sub2api-user-account-model-gateway.zh.revised.md) — user-provided plan; its implementation instructions do not expand user authorization.
- [Credential seam](../../credentials/credentials/README.md) — the owner of durable secret values.
- [LLM adapter](../../llm/llm-pi-ai/README.md) — the shared OpenAI-compatible request and SSE implementation.
- [Remote gateway](../../api/remotes/README.md) — the generated Host/Client transport used by the settings section.
- [Sub2API settings section](../../client/ui-settings-sub2api/README.md) — the browser projection of the account, usage, model, and recharge controls.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the opt-in Sub2API provider, which delegates request rendering to dsh-llm-pi-ai.

#### KV Cache effect

Route metadata is resolved from the current secret-free model catalog; request caching and token accounting remain owned by dsh-llm-pi-ai.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Partial target evidence** — a local Sub2API 0.2.5 container has passed account login, refresh, current-user, managed-Key creation with an assigned group, usage dashboard, model discovery, non-streaming Chat Completions, and streaming SSE against a deterministic OpenAI-compatible upstream. Twelve matching P0 rows are recorded as `verified`; rows without a complete independently evidenced baseline and target contract remain `not-provided`.
- **Composition supplies deployment facts** — the shared base row can create a loopback-only development transport from explicit `httpOptions`; production hostnames require an injected resolver and pinned transport. The credential provider remains supplied by the selected desktop, web, headless, or CLI composition.
- **Capabilities remain fail-closed** — model metadata must explicitly verify streaming, capacity, and other capabilities; tools and Responses remain disabled without the required independent evidence.
- **Tools are an explicit deployment opt-in** — set `DSH_SUB2API_TOOLS_ENABLED=true` only after the target model's request and tool-call response have an independent fixture. The shared base defaults this flag to `false`; a validated ThunderUni deployment may enable it together with the comma-separated `DSH_SUB2API_VERIFIED_TOOLS_MODELS` allowlist, and model ids outside that list remain blocked when metadata is unknown.
- **Recharge is a validated redirect** — the settings section can open only a server or configuration URL that passes the profile's scheme, origin, and redirect policy.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

This package remains experimental until a real target deployment closes the relevant P0 questions. Its current code provides the Host runtime, shared provider route, Remote/UI projection, and replay fixtures; synthetic fixtures are not evidence that a Sub2API deployment is reachable or compatible.

</details>

No runtime invariant companion is published because protocol parsing, redacted projections, and state transitions are checked directly by this package's tests; the Cordis, Remote, credential, and provider registries own the remaining lifecycle relationships.
