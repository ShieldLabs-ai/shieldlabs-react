# Contributing to @shieldlabs-ai/react

Thank you for improving the ShieldLabs React bindings.

## Set up

You need Node.js 20 or later. The package builds on `@shieldlabs-ai/js`, a peer dependency. Until
`@shieldlabs-ai/js` 1.0.0 is published to npm, work with a local pack of it, built from a working copy
of [shieldlabs-js](https://github.com/ShieldLabs-ai/shieldlabs-js) next to this repository:

```bash
# in shieldlabs-js
npm ci && npm run build && npm pack

# in this repository
npm ci
npm install --no-save ../shieldlabs-js/shieldlabs-ai-js-1.0.0.tgz
```

Repeat the last command after every `npm ci`. `--no-save` leaves `package.json` and
`package-lock.json` unchanged. Never commit a `file:` dependency or a tarball. When the pack is
missing, `npm run typecheck`, `npm run lint` and `npm run build` stop with these instructions
(`scripts/check-core.mjs`).

### Why the repository has an `.npmrc`

npm installs required peer dependencies by itself. It would try to download `@shieldlabs-ai/js` from
the registry, where it does not exist yet, so `npm ci` would fail. The committed `.npmrc` sets
`legacy-peer-deps=true`, so `npm ci` and `npm install` leave peer dependencies to you, and
`save-dev=true`, so `npm install --no-save <pack>` still installs the pack. Both settings apply
only to work in this repository: npm never publishes `.npmrc`, and `package.json` lists
`@shieldlabs-ai/js` as a required peer dependency, so npm installs it for the users of the package.

Once `@shieldlabs-ai/js` 1.0.0 is on npm, `npm install --no-save @shieldlabs-ai/js` works instead of the
pack. To tidy up later, delete `.npmrc`, add `@shieldlabs-ai/js` to `devDependencies`, run
`npm install` to refresh `package-lock.json`, and remove the pack steps from the CI workflow and
from this file.

## Checks

Run these before you open a pull request. CI runs them on Node.js 20, 22 and 24 with React 18
and 19.

```bash
npm run typecheck
npm run lint
npm test -- --coverage   # builds first; coverage must stay at 90 % or more
npm run build
```

To test with React 18 locally (afterwards, `npm ci` and the pack install bring back React 19):

```bash
npm install --no-save react@18 react-dom@18 @types/react@18 @types/react-dom@18 ../shieldlabs-js/shieldlabs-ai-js-1.0.0.tgz
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

Re-running the workflow is safe. When it stopped because `@shieldlabs-ai/js` was not on npm yet,
publish it and re-run the workflow; a version that is already on npm is not published again.

## Security

Please report security issues privately to <contact@shieldlabs.ai> rather than in a public issue.
