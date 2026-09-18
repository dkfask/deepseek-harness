# Agent Note: Sub2API client type face is not a browser plugin

Status: implemented

English | [中文](2026-09-17-sub2api-client-type-face-not-plugin.zh.md)

## Problem

`@deepseek-ai/dsh-experimental-sub2api` keeps `./client` for the type vocabulary re-exported by `dsh-api-remotes`; it does not own a browser runtime. Declaring that entry in `dsh.client` made the client Loader treat the type-only module as a Cordis plugin and fail before the ThunderUni UI mounted.

## Decision

Remove the `dsh.client` declaration from `@deepseek-ai/dsh-experimental-sub2api` while retaining its `./client` export. The generated Sub2API Remote contribution remains mounted by `dsh-api-remotes`, and the Sub2API settings UI keeps its own client package declaration.

## Alternatives considered

**Add an empty `apply` installer to the client type face.** Rejected because the module does not own a browser runtime, and an empty installer would hide the incorrect package declaration.

**Remove the `./client` export.** Rejected because `dsh-api-remotes` uses the exported type vocabulary when assembling the generated Remote client.

## Consequences

The browser Loader graph contains the Sub2API settings UI and Remote assembly without loading a standalone `@deepseek-ai/dsh-experimental-sub2api` client plugin. Host-side Sub2API runtime code and the public client type entry remain available.

## Verification

The short-path Windows x64 desktop package is rebuilt and its browser boot reaches the ThunderUni application without a Sub2API plugin activation error. The boot graph contains `@deepseek-ai/dsh-client-ui-settings-sub2api` and `@deepseek-ai/dsh-api-remotes`, but not a standalone `@deepseek-ai/dsh-experimental-sub2api` client entry.
