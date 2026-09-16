---
description: "ThunderUni brand occupants for the Web client's sidebar slots and the thunderuni build profile."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-thunderuni

English | [中文](README.zh.md)

## Summary

This package provides the ThunderUni mark and localized name for the Web client's sidebar. The browser plugin registers the two standard brand slots only when `DSH_CLIENT_BUILD_PROFILE` is `thunderuni`; other profiles retain their own occupants or the sidebar fallbacks. The package contributes presentation only and does not change agent requests, permissions, models, sessions, or network behavior.

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

The Web bundle includes this package beside the official brand package. Build the private-branded client with `pnpm run build:thunderuni`; the build sets `DSH_CLIENT_BUILD_PROFILE=thunderuni` and `DSH_CLIENT_TITLE=ThunderUni`. The existing `pnpm run build:official` profile remains available and activates only the official occupants.

The package owns the `thunderuni` locale namespace and supplies both English and Simplified Chinese dictionaries. The sidebar's localized name receives the standard typed `t` seat; the geometric mark is an independent SVG and does not reuse official artwork.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser half waits for both `sidebar.brand.mark` and `sidebar.brand.name` declarations before registering one occupant set. Declaration collapse withdraws both occupants, and plugin disposal removes the locale dictionaries and any active slot entries. The Host half is intentionally empty because the package has no server behavior.

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) — declares and renders the sidebar brand slots.
- [ui-brand-official](../ui-brand-official/README.md) — documents the mutually exclusive official brand profile.
- [Client locale](../locale/README.md) — owns typed browser dictionaries and the `t` seat.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package renders browser chrome only and sends no model-visible text or requests.

#### KV Cache effect

None; the package does not participate in model request assembly.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Sidebar-only identity** — the package does not replace the conversation hero artwork or server-side product language.
- **Build-time title** — the browser document title is selected by `DSH_CLIENT_TITLE`, outside the slot registry.

<a id="dev-note"></a>
### Dev Note

The package remains compatible with the upstream `dsh` launcher and runtime profiles. Brand selection is a client build concern, not a runtime permission or model configuration.

No runtime invariant companion is published because the package retains no mutable state; its three slot occupants install and leave through one transactional effect.
