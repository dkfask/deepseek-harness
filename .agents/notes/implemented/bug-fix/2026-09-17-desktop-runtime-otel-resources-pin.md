# Agent Note: Desktop runtime pins the complete OpenTelemetry resources package

Status: implemented

English | [中文](2026-09-17-desktop-runtime-otel-resources-pin.zh.md)

## Problem

The Desktop production runtime creates a fresh dependency lockfile from published package manifests. A range on `@opentelemetry/resources` selected 2.11.0, whose CommonJS host detector imports `build/src/detectors/platform/node/machine-id/getMachineId` although that file is absent from the published package. The session telemetry plugin then prevented the bundled Host from loading.

## Decision

`@deepseek-ai/dsh-session-telemetry-otel` depends on the verified complete `@opentelemetry/resources` 2.10.0 release. The Desktop runtime therefore installs the same version recorded by the workspace lockfile and does not resolve a newer range during package preparation.

## Alternatives considered

**Keep the semver range and accept the newest release.** Rejected because Desktop startup must validate the exact published runtime tree, and the selected release is not executable on the Host's CommonJS path.

**Patch the installed OpenTelemetry package in the Desktop output.** Rejected because it would create an untracked dependency fork and could diverge between development, packaging, and user profile repairs.

**Disable session telemetry in the Desktop profile.** Rejected because telemetry is part of the shipped base composition; removing it would hide a broken dependency instead of preserving the configured plugin graph.

## Consequences

The packaged Desktop Host can load the session telemetry plugin on Windows x64 and future package preparation is deterministic for this dependency. Updating the OpenTelemetry resources release requires a targeted runtime smoke that imports the CommonJS entry and starts the packaged Host before changing the pin.

## Verification

The failure was reproduced from the installed Windows x64 package: the startup page reported the missing `machine-id/getMachineId` module. `pnpm run typecheck` and the focused Desktop and telemetry Vitest set pass. The rebuilt short-path Windows x64 package contains `@opentelemetry/resources` 2.10.0 under `dsh-session-telemetry-otel`, includes the machine-id detector, installs with no missing source files, and reaches the ThunderUni page plus the Sub2API account settings view.
