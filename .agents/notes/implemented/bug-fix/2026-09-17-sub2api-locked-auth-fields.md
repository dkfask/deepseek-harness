# Agent Note: Sub2API locked authentication field mapping

Status: implemented

English | [中文](2026-09-17-sub2api-locked-auth-fields.zh.md)

## Problem

The locked Sub2API baseline does not require a username during registration and completes TOTP login with `temp_token` and `totp_code`. A generic registration form and challenge encoder that use different required fields prevent the Host runtime from matching the baseline protocol.

## Decision

The standard Sub2API codec sends registration `email`, `password`, and optional `verify_code`; it does not require or invent a username. It decodes both the locked-baseline `temp_token` and compatible challenge aliases, while standard TOTP submission sends `temp_token` and `totp_code`. The Remote and Desktop forms expose only the fields owned by this standard profile.

## Alternatives considered

**Keep username as a required shared field.** Rejected because the locked baseline omits it and the Host must not make an unverified field mandatory.

**Keep the generic `code` and `two_factor_token` wire names.** Rejected because the locked baseline handler binds `totp_code` and `temp_token`; custom codecs remain available for deployments with a different verified contract.

**Silently translate every possible captcha field.** Rejected because captcha provider proofs are deployment-specific; the standard codec sends only the verified email verification field and leaves other proof mappings to a reviewed codec.

## Consequences

Baseline-compatible registration and TOTP requests can be represented without leaking or persisting authentication material. A deployment that requires an additional registration proof must supply a profile-specific codec or expose an explicit server error; the standard Desktop form does not pretend to solve a captcha it cannot verify.
