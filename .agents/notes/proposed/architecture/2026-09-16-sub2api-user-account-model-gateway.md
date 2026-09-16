# Agent Note: Sub2api user account and model gateway integration

Status: proposed

English | [中文](2026-09-16-sub2api-user-account-model-gateway.zh.md)

## Problem

Harness needs a first-party account path that lets a user register with and sign in to sub2api, use the user's sub2api API Key for model traffic, and see the balance and usage that sub2api owns.

Harness has separate anonymous telemetry identity, browser authentication, credentials storage, LLM adapters, Remote controllers, and settings UI, but it has no capability that joins these concerns without exposing upstream secrets or changing the agent loop.

The sub2api repository baseline supplied for this design is commit `881f3202694c6bc932446931a30c27d9675178b9`; endpoint behavior must be rechecked against that baseline and against the deployed instance before any compatibility claim is recorded.

## Proposal

Add a dedicated `sub2api` capability with a Host Service Provider, client-safe types, and consumers for the Remote controller and the model provider. Keep the account session separate from conversation `SessionId`, anonymous identity, and browser-auth cookies.

Store one versioned opaque `GrantRecord` at `credentialKey('sub2api', 'user-session')`. The record may contain the sub2api user id, email, display metadata, product API Key, and an official refresh credential only when sub2api supplies one. Keep the access JWT in process memory, never store a password, and never invent a refresh token. Rotate or replace the record only through `ctx.credentials.modifyRecord`; validate the exact record version at the durable boundary and redact secrets from diagnostics.

When the deployed sub2api API has no refresh capability, a process restart or expired access JWT enters a reauthentication state. A persisted API Key does not by itself make the Harness account authenticated; model dispatch requires a current valid account session and the API Key snapshot held by that request. Logout clears the in-memory token, stored API Key and account record, account and model caches, and in-flight account state while preserving anonymous identity and browser authentication.

Centralize user-facing HTTP calls in the capability. The configuration accepts an explicit deployment base URL and an optional configured purchase URL, never a credential literal. Implement registration with `email`, `password`, and `username`; login with `email` and `password`; `/api/user/me`; API Key reuse or creation using only endpoints verified on the target sub2api build; `/v1/models`; `/api/usage/dashboard`; and purchase URL lookup.

The client accepts both direct JSON responses and `{ data: ... }` envelopes, uses Bearer JWT headers for user APIs and the verified API Key header for model APIs, bounds response bodies, honors cancellation and timeouts, and never logs secret-bearing headers or bodies. It does not implement or expose sub2api Admin APIs, payment signatures, webhooks, or Admin API keys.

Every server request validates `http` or `https`, rejects invalid, local, loopback, link-local, private, multicast, unspecified, and other reserved hosts, resolves hostnames before connection, and revalidates every redirect destination. The purchase URL is returned only after its configured scheme and host policy pass; the client does not append a long-lived JWT to a URL or place one in ordinary logs.

Map status and transport failures to stable product errors for unauthenticated or expired tokens, insufficient balance, unavailable models or accounts, rate limits, timeouts, invalid requests, malformed responses, and service failures. A 401 invalidates the current in-memory token and permits at most one state reload or reauthentication transition. A 402 prevents model dispatch and exposes the recharge action. A 403, 429, timeout, and 5xx remain distinguishable to retry policy and UI recovery.

Expose a `sub2api` Remote namespace with validated requests and explicit redacted projections for status, register, login, logout, account refresh, usage, model refresh, and purchase URL lookup. Remote results never contain access tokens, refresh credentials, API Keys, raw upstream bodies, or Admin secrets. Forward only non-secret account, model, and usage invalidations needed by the browser.

Use `ctx.authorization` for interactive login and registration flows where the composition provides an interaction channel. Each flow honors cancellation and commits its record during the attempt. Headless and CLI compositions fail early with an actionable login-required error instead of pretending to offer an interactive prompt.

Extend `llm-pi-ai` with a narrow Host-only route registration and runtime API Key resolver for a reserved `sub2api` provider. The route uses the configured base URL plus `/v1`, `openai-completions`, and models obtained from `/v1/models`; it does not use `apiKeyEnv`, an environment variable, or a settings document to carry the managed API Key. The resolver snapshots the authenticated session before dispatch and throws the stable unauthenticated error before network activity when no session exists.

Reuse pi-ai's existing OpenAI-compatible request conversion, SSE stream assembly, usage handling, tool-call lifecycle, timeout watchdog, attribution headers, and provider retry policy. Register the route in shared base composition so desktop, web, headless, and CLI resolve the same service. Do not enable Responses until a real fixture proves its events, tool calls, usage, terminal stop, and error behavior with the deployed sub2api build.

Add a settings Account section through the existing `settings.section` slot. It owns login, registration, logout, redacted account and balance display, usage loading, model refresh state, insufficient-balance recovery, and a recharge button that opens the verified configured purchase page without embedding long-lived credentials. After the page returns, refresh account state and models from sub2api rather than trusting browser callback data.

Register all account copy through a feature-owned English and Simplified Chinese locale dictionary, including validation, authentication, expired-token, insufficient-balance, unavailable-service, and purchase-navigation failures. The settings shell remains unchanged; the feature uses the existing Remote, locale, settings, slot, and open-url services.

Deliver the work in four compatibility-ordered phases. Phase A adds the sub2api capability, credential record, login and registration lifecycle, `/api/user/me`, API Key lifecycle, envelope parsing, error mapping, URL policy, and HTTP fixtures; it does not add account UI, recharge navigation, or Responses. Phase B adds the built-in provider, dynamic model list, Chat Completions normal and SSE paths, tools, usage, balance errors, and shared composition coverage. Phase C adds the Account UI, usage display, recharge navigation, localization, and browser persistence coverage. Phase D may enable Responses only after protocol fixtures pass; a future payment facade remains server-only and is outside the first version.

## Alternatives considered

**Treat sub2api as a normal user-configured pi-ai gateway.** This would require the user to provide a URL and API Key, makes the managed account invisible to the Host, and risks persisting or returning a product credential. The dedicated route preserves the requested sign-in flow and keeps key resolution inside the Host.

**Put the access JWT or API Key in settings, an environment variable, or a session event.** These stores are visible to configuration, logs, replay, or unrelated processes and cannot provide the required logout invalidation. The credential provider's opaque record plus an in-memory access token keeps ownership explicit.

**Build a separate sub2api LLM adapter and duplicate OpenAI streaming logic.** This would fork conversion, SSE, tool-call, usage, timeout, and retry behavior already maintained by pi-ai. A narrow `llm-pi-ai` registration extension keeps one OpenAI-compatible implementation.

**Implement a Harness-owned payment facade in the first version.** This adds webhook verification, payment state, Admin API credentials, idempotent recharge, and an order ledger to a scope that explicitly reuses sub2api payment capability. The first version opens the configured purchase page and refreshes server-owned account state instead.

**Enable Responses because the route exists.** Route presence does not prove event, tool-call, usage, or stop-event compatibility. Responses remains disabled until a real compatibility fixture proves the complete path.

## Acceptance criteria

- A fixture-backed client registers, logs in, reads `/api/user/me`, reuses or creates one product API Key through verified endpoints, loads models, reads usage, and parses both response envelope forms.
- The durable record contains no password or fabricated refresh token, the access JWT remains runtime-only unless an official refresh field is verified, and logout removes the API Key and all account/model caches without touching anonymous identity or browser authentication.
- Unit and HTTP fixture tests cover header selection, token state transitions, envelope parsing, URL and redirect host policy, 401/402/403/429/timeout/5xx mapping, malformed responses, cancellation, and response-size limits.
- Remote tests prove request validation, safe field projection, absence and failure mapping, and that no token, API Key, raw response body, or Admin credential crosses the wire.
- The built-in provider rejects an unauthenticated request before network dispatch, loads the verified model list, completes Chat Completions ordinary and SSE requests, preserves usage, replays tool calls and results, and maps balance and retryable failures to stable LLM outcomes.
- Shared desktop, web, headless, and CLI compositions mount the same account service; non-interactive surfaces return a clear login-required error.
- Account UI tests cover registration, login, logout, expired-token recovery, balance-insufficient recovery, usage, model refresh, purchase navigation failure, and state refresh after returning from the purchase page.
- English and Simplified Chinese locale dictionaries, package README/JSDoc contracts, compatibility documentation, and keyless recorded-session snapshots cover the delivered behavior.
- Responses support is absent unless its real event, tool-call, usage, terminal-stop, and error fixtures pass against the recorded sub2api baseline.

## Risks

Sub2api deployments may differ in token lifetime, API Key listing behavior, model response fields, SSE framing, or purchase-page configuration. The client must verify the deployed contract and keep unverified endpoints and Responses support out of the product rather than silently guessing.

DNS rebinding, redirects, proxy behavior, and IPv4 or IPv6 textual aliases can defeat a URL string check. The HTTP implementation must bind the validated resolved destination used for the connection and test prohibited address classes and redirects explicitly.

A stale access token or API Key may race logout or a credential-file change. Each request must capture a session generation and reject or discard results from an invalidated generation; logout must be idempotent and must not wait on an unbounded network operation.

Persisting a sub2api API Key makes account records sensitive even when access JWTs remain in memory. The local credential provider's file permissions, redacted views, and diagnostic rules remain mandatory, and tests must assert that secrets do not enter snapshots, logs, Remote events, or URLs.

The built-in route can conflict with a user-configured provider of the same id or with a default-model selection. Registration must reserve the route id, replace registrations atomically, and document the selection behavior instead of allowing ambiguous ownership.

The account UI depends on browser-authenticated local Host RPC but is not product authentication. The implementation must not use sub2api login to authorize arbitrary Host requests or change browser cookie semantics.
