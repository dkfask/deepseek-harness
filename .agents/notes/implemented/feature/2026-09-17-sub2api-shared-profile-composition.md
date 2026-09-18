# Agent Note: Sub2API shared profile composition

Status: implemented

English | [中文](2026-09-17-sub2api-shared-profile-composition.zh.md)

## Problem

The Sub2API capability had Host, Remote, UI, and fixture code, but shipped profiles did not mount the Host service. Desktop and non-desktop surfaces could therefore not share one account runtime, and the Cordis Loader path had no proof that a deployment-specific profile could construct its transport.

## Decision

The `dsh-base` bundle owns one disabled-by-default `sub2api` row. `DSH_SUB2API_ENABLED=true` enables the row in every base-backed surface, including the Web, headless, SDK, ACP, and desktop compositions; the Web client settings row uses the same gate. The row reads deployment URLs, a deployment fingerprint, cache and transport limits, recharge policy, and model-capability evidence from explicit environment expressions.

`Sub2apiService` accepts either a normalized profile or the plain profile fields used by a Loader patch. When a composition does not inject a transport, it creates a bounded HTTP client only for the two configured origins and IP-literal destinations. A production hostname must supply a resolver and pinned transport explicitly, so the convenience path cannot silently turn DNS into an SSRF policy decision.

The standard codec follows the locked Sub2API 0.2.5 response conventions observed in the local deployment: registration includes `username`, account and Key identifiers accept safe numeric IDs, Key lists accept the paginated `items` collection, `/auth/me` contributes the safe account balance, and dashboard `total_actual_cost` contributes the usage amount. Model rows without capability metadata remain unknown unless the deployment explicitly supplies verified Chat Completions/SSE evidence and capacities.

The HTTP client reads bounded non-success JSON bodies and recognizes the deployment's `ADMIN_COMPLIANCE_ACK_REQUIRED` response. It projects only bounded compliance metadata through Host and Remote error details, while the desktop settings section renders a localized instruction without accepting the acknowledgement or echoing the upstream response body.

The HTTP client also maps the target deployment's `INSUFFICIENT_BALANCE` business code to the stable balance error when the gateway returns it with HTTP 403. The mapping keeps the recovery path usable across deployments that encode balance failures as either HTTP 402 or HTTP 403.

## Alternatives considered

**Mount the service only in a new custom bundle.** Rejected because the requested account capability must be shared by desktop and the existing base-backed command surfaces; keeping the row in `dsh-base` gives every surface the same opt-in point.

**Make the local HTTP client trust any configured hostname.** Rejected because URL text alone does not pin a network destination. The default constructor is limited to explicit IP-literal development targets; production integrations own DNS resolution, peer validation, and pinning through the injected transport.

**Enable the model route whenever the account row is enabled.** Rejected because model discovery does not prove Chat Completions, SSE, capacities, tools, or Responses. The route remains separately gated by explicit evidence, and Responses remains disabled.

## Consequences

Base-backed profiles now carry the experimental Sub2API package in their dependency closure, and the package is an explicit public experimental release member so published base artifacts remain installable. Normal launches remain unchanged because the row is disabled. Enabling a local Docker deployment needs only the deployment environment and a reachable backend; enabling model requests additionally needs a configured usable Sub2API group and independently verified capability settings. The local 0.2.5 container currently proves health, public settings, authentication, refresh, and Key pagination, while its model gateway returns `403` without a usable group, so the compatibility matrix remains target `not-provided` until a normal-user end-to-end fixture is recorded.

The package's real Loader composition test and the Web startup smoke protect the mount path. Synthetic fixtures continue to own protocol, race, error, and secret-leakage evidence; neither kind of test upgrades the target deployment matrix on its own.
