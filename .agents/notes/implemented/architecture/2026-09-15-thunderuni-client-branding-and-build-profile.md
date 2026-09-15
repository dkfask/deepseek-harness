# Agent Note: ThunderUni client branding and build profile

Status: implemented

English | [中文](2026-09-15-thunderuni-client-branding-and-build-profile.zh.md)

## Problem

The fork needs a private product identity for its browser client without changing the upstream `dsh` launcher, agent runtime, session format, tool behavior, or server request surface. A single replacement of the upstream brand would also make the existing official client profile harder to build and validate.

## Decision

ThunderUni is implemented as a client-side brand package at `packages/client/ui-brand-thunderuni`. The package contributes its own lightning mark and localized wordmark through the existing `sidebar.brand.mark` and `sidebar.brand.name` slots. It registers its `thunderuni` locale namespace with complete English and Simplified Chinese dictionaries, and it registers slot occupants only when `DSH_CLIENT_BUILD_PROFILE` is `thunderuni`. Slot declaration-aware effects keep both occupants together across declaration order, withdrawal, reappearance, and plugin disposal.

The web bundle carries both `@deepseek-ai/dsh-client-ui-brand-official` and `@deepseek-ai/dsh-client-ui-brand-thunderuni`. Each package gates its occupants on its own profile, so the `official` profile retains the upstream brand while the `thunderuni` profile activates ThunderUni. The new `build:thunderuni` command uses the existing complete-build pipeline and publishes `DSH_CLIENT_BUILD_PROFILE=thunderuni` and `DSH_CLIENT_TITLE=ThunderUni` alongside the repository version and commit metadata. Desktop packaging accepts the same `--profile official|thunderuni` choice, passes it to the complete client build and dsh release-artifact verifier, and keeps `official` as the default.

Browser defaults and generic local-build fallback copy use ThunderUni, including the document title, PWA manifest, boot page, and locale-owned sidebar fallback. This package and profile do not add server URLs, model-visible text, agent-loop behavior, session events, permissions, sandbox policy, or KV-cache behavior.

## Verification

The ThunderUni package and build-environment tests pass. Host and aggregate Client TypeScript builds pass. GUI, dependency, client-package, client-i18n, generated-catalog, translation-pairing, README, and constraints checks pass. The complete `official` build and its keyless built Web smoke pass, and the complete `thunderuni` build records the ThunderUni profile and produces a Web artifact titled ThunderUni. Profile-aware Desktop preparation also builds the ThunderUni client tarball and reaches runtime/package-set preparation; macOS runtime signing stops without a local codesigning identity. The final keyless built-boot and PWA smoke passes without a model key, while signed installers, notarization, real API, deployment, and strict UAT remain outside this decision.

## Alternatives considered

**Replace the official brand package in the Web roster.** Rejected because it would remove the upstream `official` profile and make compatibility validation less explicit. Keeping both packages with profile-gated occupants preserves both build paths.

**Rename the `dsh` launcher or alter the core runtime.** Rejected because the requested product identity is a browser-client concern. Renaming or changing the launcher would expand compatibility and release scope without improving the branded Web experience.

**Hardcode ThunderUni in JSX and styles.** Rejected because client UI copy is locale-owned and the repository's i18n gate requires product text to flow through typed dictionaries or localized props. The mark is separate geometry, while the wordmark comes from the package's locale namespace and CSS module.

**Add a new server or model request path for the branded client.** Rejected because branding does not require new network capability and should not enlarge the request surface.

## Consequences

- The fork has an explicit `thunderuni` client build profile while `official` remains available.
- Sidebar branding is independently owned, declaration-aware, reversible, and removable with the plugin.
- Browser-shell copy and generated metadata consistently identify ThunderUni, while upstream runtime and launcher contracts remain unchanged.
- The final Web build depends on the local Node and pnpm environment used by the repository's native build pipeline; real API and production deployment evidence still require separate verification.
