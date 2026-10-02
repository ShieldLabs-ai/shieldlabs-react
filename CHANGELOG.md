# Changelog

All notable changes to `@shieldlabs-ai/react` are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Contributor and example setup uses published ShieldLabs peers from npm. Local tarballs remain
  optional for testing changes; a checkout of another SDK is no longer required.

## [1.0.0] - 2026-09-30

### Added

- `ShieldLabsProvider` with the props `publicKey`, `environment`, `scriptUrl`, `timeout`,
  `autoLoad` and `checkOnLoad`: loads the agent once with `load()` of `@shieldlabs-ai/js`, in an effect
  after the first render, and reports `status` (`loading`, `ready` or `error`) and `error`. Invalid
  props and pages that are not a secure context also log a console warning. Changing an option
  loads the agent for the new options.
- `autoLoad={false}` defers loading, for example until consent: nothing loads until `load()` is
  called or `autoLoad` becomes `true`. Until then `useIdentify().identify()` resolves `null` at
  once with a `not_initialized` error, and `runOnMount` ends the same way without running again
  after `load()`. `useShieldLabs().identify()` rejects with `not_initialized`, `check()` resolves
  `null` and `getAgent()` waits, with no timeout of its own.
- `useShieldLabs()`: `status`, `error`, `identify()`, `check()`, `load()` and `getAgent()` of the
  closest provider. `getAgent()` resolves the loaded agent of `@shieldlabs-ai/js`, for early
  identification with `agent.identifyOnInteraction(form)`. Calls made while the agent loads wait
  for it, and the call timeout covers the whole call: that wait, then the agent's answer in the
  time that is left. A failed or timed-out load is tried again by the next call.
- `useIdentify({ userId, runOnMount })`: `identify()`, `result`, `isLoading`, `error` and
  `reset()`. `identify()` resolves the result, or `null` with the reason in `error`, and never
  rejects. A call with the same User HID and `timeout` as a running call of the same hook returns
  that call, so a double submit costs one identification; a call without `timeout` counts as one
  with the provider `timeout`. Options of `identify()` with a `userId` key override the hook
  option, also with `undefined` or `null`, which both identify anonymously; only options without
  the key use the User HID of the hook. The state follows the call made last.
- `checkOnLoad` runs `check()` once per provider mount when the agent is ready, unless an
  `identify()` or `check()` for the same User HID is running at that moment, and `runOnMount` runs
  `identify()` once per component mount. Both run once in StrictMode.
- Server rendering that touches neither `window` nor `document`, no state updates after unmount,
  state that stays current inside a hidden `<Activity>` (React 19.2 and later), and hooks outside
  the provider throw an error that names the hook.
- Re-exports of `ShieldLabsError` and the types `IdentifyOptions`, `IdentifyResult`,
  `InteractionIdentifier`, `LoadOptions`, `ShieldLabsAgent` and `ShieldLabsErrorCode` from
  `@shieldlabs-ai/js`.
- ESM, CommonJS and TypeScript declarations with a `"use client"` directive. Peer dependencies:
  `react` 18 or 19 and `@shieldlabs-ai/js` 1.x.
- `examples/vite`: a signup form that starts an identification on the first interaction with
  `identifyOnInteraction()` and sends the `requestId` with the submit.

### Removed

- The placeholder `useShieldLabs(options)` hook of the pre-release scaffold, which returned `data`.
  The browser receives a request ID; results are read on your server.

[Unreleased]: https://github.com/ShieldLabs-ai/shieldlabs-react/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ShieldLabs-ai/shieldlabs-react/releases/tag/v1.0.0
