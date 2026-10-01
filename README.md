# @shieldlabs-ai/react

React bindings for ShieldLabs device intelligence: a provider that loads the ShieldLabs agent once,
and hooks that return a request ID for every identification, with loading and error state.

[![CI](https://github.com/ShieldLabs-ai/shieldlabs-react/actions/workflows/ci.yml/badge.svg)](https://github.com/ShieldLabs-ai/shieldlabs-react/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@shieldlabs-ai/react)](https://www.npmjs.com/package/@shieldlabs-ai/react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

`@shieldlabs-ai/react` is a thin layer over [`@shieldlabs-ai/js`](https://github.com/ShieldLabs-ai/shieldlabs-js),
the browser loader that imports the hosted agent from `https://cdn.shieldlabs.ai` at runtime. It
supports React 18 and 19, renders on the server without touching browser globals, and loads the
agent once per app, also in StrictMode.

New to ShieldLabs? [Start free](https://app.shieldlabs.ai), then copy the Public Key of your domain
from Integration > API keys in the analytics dashboard (the Install tab also shows a ready snippet
that contains it).

## How it fits

1. **Browser.** `ShieldLabsProvider` loads the agent, and `useIdentify()` runs an identification for
   a protected action. The page receives a `requestId`.
2. **Your backend.** It receives the `requestId` with the protected action (signup, login,
   checkout) and reads the verdict for it from the History API with a ShieldLabs server SDK, or
   receives it in a signed `identification.scored` webhook.
3. **Decision.** Your backend acts on the Risk Score (bands: trusted 0-29, suspicious 30-59,
   dangerous 60-100), the detection flags and identifiers such as the device ID.

The browser only ever gets the request ID. The Risk Score, risk signals, detection flags, visitor ID
and device ID are read on your server, with one of the server SDKs:
[Node.js](https://github.com/ShieldLabs-ai/shieldlabs-node),
[Python](https://github.com/ShieldLabs-ai/shieldlabs-python),
[Go](https://github.com/ShieldLabs-ai/shieldlabs-go),
[PHP](https://github.com/ShieldLabs-ai/shieldlabs-php),
[Java](https://github.com/ShieldLabs-ai/shieldlabs-java) or
[.NET](https://github.com/ShieldLabs-ai/shieldlabs-dotnet).

The `identification.scored` webhook is delivered once per identification today (1-second timeout,
no retries). Use the History API when you need a guaranteed read, and make webhook handlers
idempotent on `data.request_id`, because future retries will resend identical bytes.

## Install

```bash
npm install @shieldlabs-ai/react @shieldlabs-ai/js
# or
yarn add @shieldlabs-ai/react @shieldlabs-ai/js
# or
pnpm add @shieldlabs-ai/react @shieldlabs-ai/js
```

`@shieldlabs-ai/js` (1.x) and `react` (18 or 19) are peer dependencies.

## Quick start

The snippets use Vite with TypeScript; other bundlers expose environment variables their own way.
Put the Public Key of your domain in `.env` (the value below is a placeholder):

```bash
# .env
VITE_SHIELDLABS_PUBLIC_KEY=0123456789abcdef0123456789abcdef
```

Render `ShieldLabsProvider` once, near the root of your app, around the components that identify:

```tsx
// main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldLabsProvider } from '@shieldlabs-ai/react';
import { SignupForm } from './SignupForm';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShieldLabsProvider publicKey={import.meta.env.VITE_SHIELDLABS_PUBLIC_KEY}>
      <SignupForm />
    </ShieldLabsProvider>
  </StrictMode>,
);
```

Run an identification when the user submits a protected action, and send the `requestId` with it:

```tsx
// SignupForm.tsx
import type { SyntheticEvent } from 'react';
import { useIdentify } from '@shieldlabs-ai/react';

export function SignupForm() {
  const { identify, isLoading } = useIdentify();

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    // null when there is no identification (the reason is in `error`). The signup goes out anyway,
    // and your server treats it as unverified.
    const result = await identify();
    await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, requestId: result?.requestId ?? null }),
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <input name="email" type="email" required />
      <button disabled={isLoading}>Sign up</button>
    </form>
  );
}
```

`identify()` never rejects: it resolves the result, or `null` with the reason in `error`. A second
submit while the identification runs gets the same one, so a double click costs one identification.

On your server, read the verdict for `requestId` with a server SDK, for example
`identifications.get(requestId)` in [`@shieldlabs-ai/node`](https://github.com/ShieldLabs-ai/shieldlabs-node),
which waits until the identification has been scored. The History row appears about 1-3 seconds
after `identify()` resolves and can be refined for up to about 10 seconds as follow-up checks
finish, so starting the identification when the user begins the action (see
[Protect a form](#protect-a-form)) gets your server the verdict sooner. Accept each request ID once
and only within your freshness window (the examples use 5 minutes): one identification authorizes
one protected action.

> **Keep the page alive after `identify()` resolves.** The agent posts the identification right
> after it hands over the request ID. Sending your request with `fetch()`, as above, keeps the page
> open. If you navigate right after the submit (a full-page form post or a redirect), start the
> identification early instead (see [Protect a form](#protect-a-form)).

> **Test on a registered domain.** ShieldLabs records identifications only for the domains
> registered in your account. On `localhost` the page still receives a `requestId`, but the
> identification is rejected with `401` and your backend never finds it. Test on a development
> domain with its own keys, as described in [Environments](https://docs.shieldlabs.ai/setup/environments).

## Guide

### Protect a form

`identify()` on submit, as in the quick start, is enough for most single-page apps. To have the
identification finished by the time the user submits, start it on the first interaction with the
form. `getAgent()` from `useShieldLabs()` resolves the loaded agent of `@shieldlabs-ai/js`, and its
`identifyOnInteraction(form)` starts `identify()` on the first `focusin`, `pointerdown` or `keydown`
inside the form. The handle's `take()` returns that identification for this submission and re-arms,
so the next submission gets its own request ID:

```tsx
import { useEffect, useRef, type SyntheticEvent } from 'react';
import { useIdentify, useShieldLabs, type InteractionIdentifier } from '@shieldlabs-ai/react';

export function SignupForm() {
  const { getAgent } = useShieldLabs();
  const { identify } = useIdentify();
  const formRef = useRef<HTMLFormElement>(null);
  const early = useRef<InteractionIdentifier | null>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let active = true;
    getAgent().then(
      (agent) => {
        if (active) early.current = agent.identifyOnInteraction(form);
      },
      () => {}, // the agent could not load: the submit handler tries again
    );
    return () => {
      active = false;
      early.current?.dispose();
      early.current = null;
    };
  }, [getAgent]);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    // The early identification while it is fresh, otherwise a new one. Without an early handle,
    // identify() loads the agent again; it resolves null when there is no identification.
    const result = early.current ? await early.current.take().catch(() => null) : await identify();
    await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, requestId: result?.requestId ?? null }),
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <input name="email" type="email" required />
      <button>Sign up</button>
    </form>
  );
}
```

For a classic full-page post, put the request ID in a hidden field
(`<input type="hidden" name="requestId" />` in a `<form method="post" action="/signup">`) and submit
the form yourself:

```tsx
async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = await early.current?.take().catch(() => null);
  (form.elements.namedItem('requestId') as HTMLInputElement).value = result?.requestId ?? '';
  form.submit();
}
```

Because the identification starts on the first interaction, it has normally finished posting by the
time the user submits. If users can submit without interacting first (for example autofill and a
single click on the button), prefer sending the form with `fetch()`, which keeps the page alive.

`take()` hands out the early identification only while it is fresh. When it failed, or finished more
than 4 minutes ago, `take()` starts a new one, so the request ID your server receives stays inside a
5-minute freshness window. While users keep interacting with the form, a new identification starts
at most every 4 minutes (after a failure, at most one attempt every 5 seconds), and each of them is
billed. The effect's cleanup removes the listeners when the form unmounts. With
`autoLoad={false}` (see [Consent](#consent)), `getAgent()` waits for `load()`, so the form is armed
once `load()` has been called and the agent has loaded.

[`examples/vite`](./examples/vite) is a complete signup form built this way.

### Signed-in users: pass a User HID

Pass a User HID so ShieldLabs ties the identification to the account. Compute it **on your server**
from your account ID with a secret key, for example with the `userHid(userId, secret)` helper of
the server SDKs (HMAC-SHA256, 64 hex characters), and hand it to the page, for example in your
session data:

```tsx
const { identify } = useIdentify({ userId: session.userHid });
// Later, for the protected action. identify({ userId }) overrides the User HID for one call.
const result = await identify(); // result?.userId is the User HID that was sent
```

Options of `identify()` with a `userId` key override the User HID of the hook for that call, also
when the value is `undefined` or `null`: `identify({ userId: undefined })` identifies anonymously.
Only options without the key use the User HID of the hook.

Never pass a raw email address, phone number or database ID. Omit `userId` for visitors who are not
signed in. The rules for the value (reserved values, characters that are hard to search) are in the
[`@shieldlabs-ai/js` guide](https://github.com/ShieldLabs-ai/shieldlabs-js#signed-in-users-pass-a-user-hid).

### Identify when a component mounts

`useIdentify({ runOnMount: true })` runs `identify()` once when the component mounts, as soon as the
agent is ready. `isLoading` is `true` from the first render. Re-renders, prop changes and StrictMode
do not run it again; a new mount of the component does. With `autoLoad={false}`, a mount before
`load()` ends at once with a `not_initialized` error and does not run again after `load()` (see
[Consent](#consent)). Every run is a billable identification, so use it for a component that is
itself the protected step, never in a layout, a list item or a component that mounts on every route.

`result` is one identification, and one identification authorizes one protected action: send its
`requestId` with a single request, within your freshness window (5 minutes in the examples). Your
server rejects a request ID it has seen before or one that is too old. For every later action (a
retry after a declined card, a second submit, a user who comes back after a break), call
`identify()` again. For form submits, `identify()` in the submit handler, as in the quick start, is
the simpler choice.

```tsx
function RecoveryStep({ userHid }: { userHid: string }) {
  const { result, isLoading } = useIdentify({ userId: userHid, runOnMount: true });
  if (isLoading) return <p>Loading</p>;
  // The request ID goes with the one request that loads the recovery options. Without a result (the
  // identification failed), that request is sent without a requestId.
  return <RecoveryOptions requestId={result?.requestId ?? null} />;
}
```

### Background checks with `checkOnLoad`

`checkOnLoad` runs `check()` once per provider mount when the agent is ready, for passive monitoring
of the visit. `true` checks anonymously, `{ userId }` passes a User HID:

```tsx
<ShieldLabsProvider publicKey={publicKey} checkOnLoad={session ? { userId: session.userHid } : true}>
  <App />
</ShieldLabsProvider>
```

The agent limits `check()` to one identification per visit every five minutes, shared across tabs.
The check uses the value of `checkOnLoad` at the moment the agent becomes ready, and changes after
that do not run it again. It is skipped when an `identify()` or `check()` for the same User HID is
still running at that moment (for example `runOnMount`, or a submit made while the agent loaded):
that call already identifies the visit, and the agent runs one identification at a time for a User
HID. A skipped or failed check is ignored (invalid options log a console warning). Your backend sees
these identifications like any other; to get the request ID in the page, call `check()` from
`useShieldLabs()` instead, which resolves `null` when the agent skipped it.

### Loading and error state

`useShieldLabs()` returns the agent status, the provider's `identify()` and `check()`, `load()`
and `getAgent()`:

```tsx
function AgentStatus() {
  const { status, error } = useShieldLabs();
  if (status === 'error') return <small>Identification is unavailable ({error?.code}).</small>;
  return null;
}
```

You do not need to wait for `'ready'`: `identify()` and `check()` called while the agent loads wait
for it. The call's `timeout` (default: the provider `timeout`, 10 seconds) covers the whole call:
that wait and then the agent's answer, which gets only the time that is left. Never block a
protected action on the status. When the agent cannot load (a content blocker, a network error),
send the action without a `requestId`; your backend treats it as unverified. A failed or timed-out
load is tried again by the next `identify()`, `check()`, `getAgent()` or `load()`, and the status
follows. When the provider props are invalid (for example a missing `publicKey` because an
environment variable is not set) or the page is not a secure context, the provider also logs a
console warning that starts with `[ShieldLabs]`.

`identify()` and `check()` of `useShieldLabs()` are the calls of `@shieldlabs-ai/js`: `identify()`
rejects with a `ShieldLabsError` when there is no identification. `useIdentify()` wraps it with
`result`, `isLoading` and `error`, never rejects and shares a running call.

### Server-side rendering and StrictMode

- The provider and the hooks render on the server. Nothing touches `window` or `document` during
  render; the agent loads in an effect after hydration (with `autoLoad={false}`, once `load()` is
  called). The server HTML shows `status: 'loading'` (and `isLoading: true` for `runOnMount`).
- In StrictMode the provider loads the agent once, and `runOnMount` and `checkOnLoad` run once per
  mount. `load()` of `@shieldlabs-ai/js` is memoized per agent URL and Public Key, so mounting the
  provider again reuses the agent that is already loaded.
- The hooks never identify on re-renders or on route changes. Keep the provider above your router so
  that navigation does not remount it.
- Inside `<Activity mode="hidden">` (React 19.2 and later) the provider and the hooks keep their
  state. A load or an identification that finishes while the content is hidden shows up when it is
  visible again, and showing it again does not run `runOnMount` or `checkOnLoad` again.
- The built files start with the `"use client"` directive, so bundlers for React Server Components
  treat the package as client code.

### Next.js

Use [`@shieldlabs-ai/next`](https://github.com/ShieldLabs-ai/shieldlabs-next). It provides this
provider and these hooks as a client module for the App Router (the Pages Router is documented
there) and adds server helpers in `@shieldlabs-ai/next/server` for reading identifications and
verifying webhooks in route handlers.

### Call budget and Content Security Policy

The rules of `@shieldlabs-ai/js` apply unchanged:

- [Call budget](https://github.com/ShieldLabs-ai/shieldlabs-js#call-budget): one identification per
  protected action, and a small per-IP budget on the ingest. Never clear the agent's storage.
- [Content Security Policy](https://github.com/ShieldLabs-ai/shieldlabs-js#content-security-policy):
  the `script-src` and `connect-src` origins the agent needs.

### Consent

The agent does not read your consent banner (see
[Consent](https://github.com/ShieldLabs-ai/shieldlabs-js#consent) in the `@shieldlabs-ai/js` guide).
Where your policy requires consent before the agent loads, render the provider with
`autoLoad={false}`: nothing loads until `load()` from `useShieldLabs()` is called, or until
`autoLoad` becomes `true`.

```tsx
import { ShieldLabsProvider, useShieldLabs } from '@shieldlabs-ai/react';
import { SignupForm } from './SignupForm';

export function App() {
  return (
    <ShieldLabsProvider publicKey={import.meta.env.VITE_SHIELDLABS_PUBLIC_KEY} autoLoad={false}>
      <ConsentBanner />
      <SignupForm />
    </ShieldLabsProvider>
  );
}

function ConsentBanner() {
  const { load } = useShieldLabs();
  // Record the choice as your consent tool requires, then load the agent.
  return <button onClick={load}>Accept</button>;
}
```

When your consent state lives in React already, pass it instead:
`<ShieldLabsProvider publicKey={publicKey} autoLoad={consentGiven}>`. Once loading has started,
calls wait for the agent as usual.

Until then, the rest of the app works unchanged and nothing waits for consent:

- `identify()` from `useIdentify()` resolves `null` at once, with a `not_initialized` error, so
  forms go out without a `requestId` and your server treats them as unverified. `runOnMount` ends
  the same way and does not run again by itself after `load()`.
- `useShieldLabs().identify()` rejects with `not_initialized`, and `check()` resolves `null`.
- `getAgent()` waits, with no timeout of its own, so a form set up for early identification (see
  [Protect a form](#protect-a-form)) is armed once `load()` has been called and the agent has
  loaded. When that load fails, `getAgent()` rejects with its error. `checkOnLoad` runs once the
  agent is ready.
- `status` stays `'loading'`.

Setting `autoLoad` back to `false` does not unload an agent that has loaded.

## Reference

| Export | Description |
|---|---|
| `ShieldLabsProvider` | Loads the agent once and provides it to the hooks below it |
| `useShieldLabs()` | Agent status, load error, `identify()`, `check()`, `load()` and `getAgent()` of the closest provider |
| `useIdentify(options?)` | Identification with `result`, `isLoading`, `error` and `reset()`. Its `identify()` resolves `null` instead of rejecting |
| `ShieldLabsError` | The error class of `@shieldlabs-ai/js` (re-exported). Has `code` and optional `cause` |
| Types | `ShieldLabsProviderProps`, `ShieldLabsStatus`, `UseShieldLabsResult`, `UseIdentifyOptions`, `UseIdentifyResult`, and from `@shieldlabs-ai/js`: `IdentifyOptions`, `IdentifyResult`, `InteractionIdentifier`, `LoadOptions`, `ShieldLabsAgent`, `ShieldLabsErrorCode` |

`<ShieldLabsProvider>` props

| Prop | Type | Default | Description |
|---|---|---|---|
| `publicKey` | `string` | required | Public Key of your domain |
| `environment` | `'production' \| 'development'` | `'production'` | Which ShieldLabs CDN to load the agent from |
| `scriptUrl` | `string` | | Advanced: agent module URL override (`https`, or `http` on `localhost` and `127.0.0.1`) |
| `timeout` | `number` | `10000` | Milliseconds to wait for the agent to load, and the default timeout of each `identify()` and `check()` call |
| `autoLoad` | `boolean` | `true` | Loads the agent after the first render. With `false`, nothing loads until `load()` is called or `autoLoad` becomes `true` (see [Consent](#consent)) |
| `checkOnLoad` | `boolean \| { userId?: string }` | `false` | Runs `check()` once per provider mount when the agent is ready, unless a call for the same User HID is running |
| `children` | `ReactNode` | | Your app |

Changing `publicKey`, `environment`, `scriptUrl` or `timeout` loads the agent for the new options
(once loading is allowed), and the status goes back to `'loading'`.

`useShieldLabs()` returns

| Field | Type | Description |
|---|---|---|
| `status` | `'loading' \| 'ready' \| 'error'` | `'loading'` until the agent has loaded, then `'ready'`, or `'error'` when loading failed |
| `error` | `ShieldLabsError \| null` | Why loading failed while `status` is `'error'` |
| `identify(options?)` | `Promise<IdentifyResult>` | Fresh identification, a new request ID on every call. Waits for the agent while it loads. Rejects with a `ShieldLabsError` |
| `check(options?)` | `Promise<IdentifyResult \| null>` | Background check, limited by the agent to one per visit every five minutes. `null` when skipped |
| `load()` | `void` | Starts loading the agent: needed only with `autoLoad={false}`. Also loads again after a failed load. Safe to call more than once; call it from an event handler or an effect |
| `getAgent()` | `Promise<ShieldLabsAgent>` | The loaded agent of `@shieldlabs-ai/js`, for example for `identifyOnInteraction(form)`. Waits while the agent loads (with `autoLoad={false}`, until `load()`), with no timeout of its own. Rejects with the load error |

`useIdentify(options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `userId` | `string` | | User HID for every identification of this hook. Options of `identify()` with a `userId` key override it, also with `undefined` or `null` (an anonymous identification) |
| `runOnMount` | `boolean` | `false` | Runs `identify()` once when the component mounts, as soon as the agent is ready |

| Field | Type | Description |
|---|---|---|
| `identify(options?)` | `Promise<IdentifyResult \| null>` | Starts a new identification and resolves its result, or `null` when there is none (the reason is in `error`). Never rejects. While a call of this hook with the same User HID and `timeout` runs, returns that call instead of starting another (a call without `timeout` counts as one with the provider `timeout`) |
| `result` | `IdentifyResult \| null` | Result of the latest identification. `null` while a new one runs, when it failed and after `reset()` |
| `isLoading` | `boolean` | `true` while the latest identification runs |
| `error` | `ShieldLabsError \| null` | Why the latest identification failed |
| `reset()` | `void` | Clears `result` and `error`. A running identification no longer updates the state, and the next `identify()` starts a new one |

The state follows the call made last. A call with another User HID or `timeout` than a running one
starts its own identification. The User HID of a call is the `userId` of its options when they have
that key (`undefined` and `null` both mean anonymous), else the `userId` of the hook: in a hook with
a User HID, `identify()` and `identify({ userId: undefined })` are two identifications. A call
without `timeout` counts as one with the provider `timeout` (10 seconds by default), so `identify()`
and `identify({ timeout: 10000 })` share one identification. Two `useIdentify()` hooks never share
a call. The functions keep their identity across renders (`identify` changes when `userId`
changes), so they are safe in effect dependencies.

`IdentifyOptions` (from `@shieldlabs-ai/js`)

| Option | Type | Description |
|---|---|---|
| `userId` | `string` | User HID computed on your server. Omit for anonymous checks |
| `timeout` | `number` | Milliseconds the whole call may take: a wait for the agent to load, then the agent's answer in the time that is left. Overrides the provider `timeout`, which also limits the load itself |

`IdentifyResult` (from `@shieldlabs-ai/js`)

| Field | Type | Description |
|---|---|---|
| `requestId` | `string` | Send it to your backend with the protected action |
| `userId` | `string \| null` | The User HID used, `null` for anonymous checks |

## Errors and retries

Every error is a `ShieldLabsError`. `useIdentify().identify()` stores it in `error` and resolves
`null`; the calls of `useShieldLabs()` reject with it. Branch on `error.code`:

| `code` | When | What happens and what to do |
|---|---|---|
| `invalid_options` | A provider prop or a call option failed validation, or `publicKey` holds a server-side secret | A bad prop sets `status` to `'error'` and logs a console warning; a bad call option fails that call. Fix the value; retrying does not help |
| `unsupported_environment` | The page is not a secure context | `status` is `'error'`, with a console warning. Serve the page over HTTPS (`localhost` and `127.0.0.1` also work over `http`) |
| `load_failed` | The agent module could not be imported (network error, content blocker, Content Security Policy) | `status` is `'error'`. Continue without an identification; the next `identify()`, `check()`, `getAgent()` or `load()` loads again |
| `timeout` | The agent did not load, or an agent call did not answer, within the timeout (default 10 seconds) | Continue without an identification. A load that timed out keeps running, and the next call uses it once it arrives |
| `not_initialized` | `identify()` only: the agent did not start an identification, for example because another one is running in this or another tab, or the provider has `autoLoad={false}` and `load()` has not been called. `check()` resolves `null` instead | Retry once later, or continue without an identification |

Whenever there is no identification, send the protected action anyway without a `requestId`: your
backend treats a missing identification as unverified (for example step-up or review), never as
clean. Calling a hook outside `ShieldLabsProvider` throws an `Error` that names the hook.

## Compatibility

- React 18 and 19 (React DOM), with TypeScript types for both.
- Browsers: the same as `@shieldlabs-ai/js` (ES modules, dynamic `import()` and WebCrypto, in a secure
  context).
- Server rendering with `react-dom/server` in Node.js 18 or later; the agent loads only in the
  browser.
- Output: ES2019 syntax as ESM and CommonJS with TypeScript declarations, marked `"use client"`.
  No dependencies besides the peer dependencies.

## Development

```bash
npm ci
# Until @shieldlabs-ai/js is on npm, install a local pack of it (see CONTRIBUTING.md):
npm install --no-save ../shieldlabs-js/shieldlabs-ai-js-1.0.0.tgz
npm run typecheck
npm run lint
npm test -- --coverage   # builds first, then runs the tests
npm run build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md). Documentation: <https://docs.shieldlabs.ai>. Analytics
dashboard: <https://app.shieldlabs.ai>. Support: <contact@shieldlabs.ai>.

## License

[MIT](./LICENSE), Copyright (c) 2026 ShieldLabs Inc.
