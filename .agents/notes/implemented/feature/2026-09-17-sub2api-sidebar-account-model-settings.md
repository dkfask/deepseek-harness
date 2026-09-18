# Agent Note: Sub2API sidebar account and model settings

Status: implemented

English | [中文](2026-09-17-sub2api-sidebar-account-model-settings.zh.md)

## Problem

After signing in to a Sub2API deployment, the Web client did not expose the signed-in identity in the sidebar and did not give the account area a direct path to model configuration. Users had to open the general settings entry and infer where deployment models and custom providers were managed.

## Decision

Register a Sub2API-owned account card in `sidebar.footer.action`. The card reads the existing remote Sub2API state, shows the display name or stable account fallback, and reports the discovered model count when available. It remains absent while signed out and collapses to an avatar when the sidebar is narrow. The existing settings trigger stays on the right side of the footer.

Keep model management in the existing `models` settings section. The authenticated Sub2API section now presents a localized model-settings callout that opens that section without closing the settings panel. The system-owned Sub2API provider is rendered there even though it has no user settings namespace, and its card refreshes the model catalog from the configured gateway endpoint instead of using a client-side model list. This reuses the current deployment-model and custom-provider persistence paths instead of creating a second model store.

Project only non-secret managed API Key metadata into the Host state view. The authenticated account section and the `settings.models.provider-card` system provider card show the Key name, group, fingerprint when available, endpoint family, and gateway-discovered models; the Key secret remains Host-only. Use the supplied `thunderuni-ai-logo.svg` as the ThunderUni mark in both the sidebar and blank-session hero, and embed it in the Web bundle.

Allow the authenticated owner to edit the managed Key's group from that system provider card. Load named groups from the authenticated user's `/groups/available` endpoint and present them in a dropdown; send the selected group through the authenticated user `PUT /keys/{id}` endpoint, preserve the Host-only secret, persist the returned group in the deployment-bound grant, and invalidate the model catalog so the next discovery uses the new route. When a standalone Sub2API provider owns the deployment model directory, hide the default `deepseek-official` row from the model settings page. Keep the edit control off the signed-out and non-Sub2API provider surfaces.

Persist a per-model context-window override in the Host `sub2api-models` settings namespace. The authenticated system provider card edits the value, and the runtime applies it to the discovered descriptor before the dynamic LLM provider resolves its profile, so a configured capacity survives restart and controls subsequent requests.

The settings card publishes a transient browser update for the matching selected route, so the active Conversation context meter reflects the saved capacity immediately; the next request remains the durable source of the Session capacity record.

## Alternatives considered

**Edit the group only in the Sub2API admin console.** Rejected because the account owner already has an authenticated user-side Key update endpoint and should not need administrator access for a Key they own.

**Expose the API Key secret to the browser to perform the update.** Rejected because the Host already owns the access token and managed Key secret; forwarding either credential to the Client would break the secret-free Remote projection.

**Keep the configured group as the only source of truth.** Rejected because a user-side group change would be lost on restart and model discovery would continue routing through the old group.

## Consequences

The signed-in footer now provides persistent identity context and a visible model-management entry while preserving the existing settings architecture. The model page gains a system provider row and backend-backed model summary without replacing the existing model/provider editor. The group editor uses server-provided names instead of making users infer numeric IDs, and the deployment-owned model view no longer presents the default DeepSeek provider alongside those models. The card does not store credentials or duplicate account state; it subscribes to the Sub2API state-change event and uses the shared remote state reader. Signed-out Web smoke cannot show the authenticated card without credentials, so the authenticated rendering contract is covered by the component test.

## Verification

- The sidebar account component test covers signed-out absence, authenticated display name and model count, and collapsed-avatar rendering.
- The settings-root and sidebar-root client tests pass with the new optional section navigation prop.
- The corner-shape style gate passes for the new circular avatar.
- The Sub2API package typecheck and bundle pass.
- The model settings copy, account Key/group projection, exact supplied logo asset, and README documentation are present in English and Chinese locale/documentation pairs.
- The model settings card loads named groups from `/groups/available`, validates and persists the selected group through the authenticated user API without exposing the Key secret, then refreshes the backend model catalog; the deployment-owned model view hides the default DeepSeek row.
- The system-provider row, backend model refresh, and empty-session Hero Logo are covered by focused tests; the ThunderUni Web build is verified against the uploaded SVG data URI.
- The ThunderUni Web profile disables the internal-testing and official-DeepSeek onboarding dialogs. Its client model catalog removes the built-in `deepseek-official` group whenever backend-owned Sub2API models are available and falls back to the first backend model when the Host default is no longer selectable; the DeepSeek adapter remains available only for internal Host services.
- Sub2API tool calls remain fail-closed by default. The local target records a real tool-call probe for `gpt-5.6-sol`, so ThunderUni Web and Desktop explicitly enable tools only for that model through `DSH_SUB2API_VERIFIED_TOOLS_MODELS`; unknown model metadata does not grant tool access.
- Persisted Sub2API sessions refresh the account token and gateway model catalog during Host hydration, so a restored `sub2api/<model>` selection is registered before the first Agent request instead of failing as an unknown model.
- The system provider card accepts a positive context-window value with optional `K`, `M`, or `G` suffixes; the Host validates and persists the resulting safe integer and applies it to the dynamic model profile.
- The Conversation context-meter test covers the immediate selected-route capacity update, while the persisted Sub2API runtime test covers the value used by subsequent requests.
