# Agent Note: Align Desktop payload smoke with the native system-lock migration

Status: implemented

English | [中文](2026-09-16-desktop-runtime-smoke-native-migration.zh.md)

## Problem

The Desktop payload smoke still required `fs-ext` after session persistence moved its POSIX lock implementation to `@deepseek-ai/node-addon-system`. The current Desktop package closure does not include `fs-ext`, so Windows packaging failed during runtime preparation before electron-builder ran.

## Decision

The payload smoke verifies that the current `@deepseek-ai/node-addon-system/flock` entry resolves without eagerly loading its POSIX native binding on Windows. The existing Koffi, node-pty, Sharp, and HTML checks continue to exercise the Windows runtime dependencies that the Desktop process uses. The obsolete `fs-ext` build permission and file-filter rules are removed with their fixtures.

## Alternatives considered

**Add `fs-ext` back only for the smoke.** Rejected because the product no longer declares or loads that package; adding it would increase the runtime and hide the stale test instead of checking the shipped dependency graph.

**Invoke the POSIX flock binding on Windows.** Rejected because the native entry intentionally rejects unsupported platforms. Windows session ownership uses the Koffi-backed kernel handle implementation.

## Consequences

Windows Desktop packaging validates the current native dependency graph and can proceed to electron-builder without an unrelated `fs-ext` installation. POSIX flock behavior remains covered by the native-system and session-persistence test suites on supported POSIX hosts.
