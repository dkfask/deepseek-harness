---
description: "Browser settings section for the Sub2API account, usage, model, and validated recharge projection."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-sub2api

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-settings-sub2api` adds the Sub2API account section and signed-in identity card to the dsh web Settings surface. It submits login, registration, and second-factor forms through the `sub2api` Remote namespace, renders only the Host's account, balance, usage, model, freshness, managed API Key metadata, and stable-error projections, and opens a validated recharge URL without storing or displaying any credential value.

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

Mount the browser entry in a Web composition that also mounts `dsh-api-remotes`, `dsh-client-ui-settings`, and the Host-side Sub2API service. The section registers one `settings.section` entry named `sub2api` and contributes English and Simplified Chinese dictionaries under `settings.sub2api`.

The signed-out view offers login and registration only when the public deployment settings allow registration; profiles without a public-settings endpoint retain the existing endpoint-driven behavior. A server-declared second-factor challenge switches to a short-lived code form. After authentication, the sidebar footer shows the safe display name or email local-part beside the existing Settings trigger. The authenticated view shows the safe account identity, balance, usage, model count, managed Key name, named group, and fingerprint when available, stale state, refresh actions, and billing actions only when payment or subscription capability is enabled and balance recharge is not disabled. Its model-settings action opens the existing Models page, where an authenticated ThunderUni/Sub2API provider card summarizes the managed Key, named group, endpoint family, and discovered models while the existing provider management remains available for custom models. The managed Key group can be edited there through a backend-backed dropdown populated by the authenticated user's available groups; the Host sends the authenticated update, retains the secret locally, persists the new group, and refreshes the model catalog. Each discovered model also has a context-window editor; a saved value is persisted in the Host `sub2api-models` namespace and applied to the dynamic provider profile. When the deployment owns the model directory, the page hides the default DeepSeek provider row so only the deployment's user models remain visible. Passwords and one-time codes are cleared after submission; no token, API Key secret, raw response, or authorization header is rendered.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The section uses the existing `settings.section` slot and receives its actions from a small client-side wrapper over `ctx.remote.sub2api`. The same wrapper registers a `sidebar.footer.action` occupant for the signed-in identity card. Host state changes arrive through the forwarded `sub2api/state-changed` event, so the footer and account page update together without polling.

The browser treats Remote failures as stable error codes and selects localized copy from the package dictionary. It does not inspect or reconstruct Remote error bodies. The Host strips the managed API Key secret before publishing the account state; the browser receives only display metadata. Public capability settings are read through the Host Remote and unknown settings fail closed for registration and billing controls. The recharge button accepts only the URL returned by the Host after the profile's scheme, origin, and redirect policy have approved it.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Sub2API Host service](../../experimental/sub2api/README.md) — lifecycle, credential ownership, model route, Remote methods, and fixtures.
- [Remote gateway](../../api/remotes/README.md) — the generated Host/Client transport and forwarded event policy.
- [Settings section seam](../ui-settings/README.md) — the slot owner and settings navigation contract.
- [Client locale](../locale/README.md) — browser dictionary registration and locale resolution.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package is a browser-side account settings projection that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No credential ownership** — the browser never reads, stores, or deletes the Host-managed access token, refresh token, or API Key secret. It may display the Host-provided Key name, group, and fingerprint as non-secret metadata.
- **No protocol defaults** — the Host must provide the verified deployment profile and Remote namespace; the section does not infer endpoint paths, authentication headers, model capabilities, or payment behavior.
- **No Responses or tools controls** — unsupported model capabilities are not exposed by this account page; the Host provider remains the owner of feature gating.
- **No external deployment evidence** — rendered synthetic fixture states are test inputs only and do not establish compatibility with a target Sub2API deployment.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers</summary>

This package is a browser-only projection. Keep all credential and protocol changes in the Host package and keep new copy in the locale dictionary.

</details>

**Runtime invariant:** The section receives only secret-free Remote state and actions; no browser-owned state contains a credential value.

No runtime invariant companion is published because the section owns only effect-disposed browser registrations; the Host runtime remains the sole owner of credential and lifecycle state.
