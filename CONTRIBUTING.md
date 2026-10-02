# Contributing to @shieldlabs-ai/react

Thank you for improving the ShieldLabs React bindings.

## Set up

You need Node.js 20 or later. Install the development tools and the published `@shieldlabs-ai/js`
peer dependency from this repository's root. You do not need a checkout of another SDK.

```bash
npm ci
npm install --no-save --legacy-peer-deps=false '@shieldlabs-ai/js@^1.0.0'
```

Repeat the second command after every `npm ci`, which removes the separately installed peer.
`--no-save` leaves `package.json` and `package-lock.json` unchanged. If a check reports that the
loader is missing, run that command again.

### Why the repository has an `.npmrc`

The lockfile was created with `legacy-peer-deps=true`; the repository keeps that setting for
`npm ci`. The separate install uses `--legacy-peer-deps=false` to resolve the published peer.
`save-dev=true` makes saved installs development dependencies by default; `--no-save` above avoids
saving anything. These settings apply only to this checkout: npm does not publish `.npmrc`.

CI still builds the loader from its `main` branch and tests the packed copy. The commands above
instead test the published 1.x loader. To test a loader change, build and pack it in its own
checkout, then replace the package name in the second command with the path to that tarball.
Never commit a `file:` dependency or a tarball.

## Checks

Run these before you open a pull request. CI runs them on Node.js 20, 22 and 24 with React 18
and 19.

```bash
npm run typecheck
npm run lint
npm test -- --coverage   # builds first; coverage must stay at 90 % or more
npm run build
```

To test with React 18 locally (afterwards, repeat the setup commands to restore React 19):

```bash
npm install --no-save --legacy-peer-deps=false react@18 react-dom@18 @types/react@18 @types/react-dom@18 '@shieldlabs-ai/js@^1.0.0'
npm run typecheck && npm test
```

## Guidelines

- Stay a thin layer over `@shieldlabs-ai/js`: load the agent only through its `load()`, never touch
  `window` or `document` during render, and never identify on re-renders or route changes.
- Every change comes with tests. The tests mock `load()` with the stand-in agent in
  `test/support/agent.ts`, and any `console.error` (such as a React update outside `act()`) fails
  a test.
- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`) and add a
  line to `CHANGELOG.md` under "Unreleased".
- Documentation style: plain technical English, "risk signals", and the three risk bands trusted
  0-29, suspicious 30-59 and dangerous 60-100.

## Releasing

Publish `@shieldlabs-ai/js` first. Then update the version in `package.json`, move the "Unreleased"
changelog entries under the new version, and push a tag such as `v1.0.1`. The release workflow runs
all checks against the published `@shieldlabs-ai/js`, packs the package and publishes the pack to npm
with provenance, using the `NPM_TOKEN` repository secret. The publish job runs in the `npm`
environment: add required reviewers to it in the repository settings to approve each release.

Re-running the workflow is safe: a version that is already on npm is not published again. If a
release requires a newer loader version, publish that version before re-running the workflow.

## Security

Please report security issues privately to <contact@shieldlabs.ai> rather than in a public issue.
