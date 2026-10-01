# React and Vite example

A signup form in React. `ShieldLabsProvider` loads the ShieldLabs agent once, the form starts an
identification on the user's first interaction with it, and the submit handler sends the `requestId`
to your backend with the signup request.

`src/SignupForm.tsx` gets the loaded agent with `getAgent()` from `useShieldLabs()` and calls
`agent.identifyOnInteraction(form)` in an effect. The first focus, click or key press in the form
starts an identification, so it is usually finished by the time the user submits. The submit
handler calls `take()`, which hands over that identification while it is fresh and has not failed,
and otherwise starts a new one; the next submission gets its own. While a user keeps interacting
with the form, a new identification starts at most every four minutes (the server accepts a request
ID for five minutes in these examples), and each one is billable. The effect's cleanup calls
`dispose()`. When the agent could not load at first, the submit handler calls `identify()` from
`useIdentify()`, which loads it again.

## Run it

```bash
npm install
cp .env.example .env   # then set VITE_SHIELDLABS_PUBLIC_KEY
npm run dev
```

Open the URL Vite prints (for example <http://localhost:5173>). The form posts JSON to
`/api/signup`: point it at your server, which reads the verdict for `requestId` with a ShieldLabs
server SDK (for example `identifications.get(requestId)` in `@shieldlabs-ai/node`).

ShieldLabs accepts identifications only from registered domains. On `localhost` the request ID
still reaches the page, but no identification is recorded. Serve the example from a registered
development domain to see results in the [analytics dashboard](https://app.shieldlabs.ai).

## Build against local copies of the packages

Before `@shieldlabs-ai/react` and `@shieldlabs-ai/js` are on npm, with both repositories side by side:

```bash
# in shieldlabs-js
npm ci && npm run build && npm pack

# in shieldlabs-react
npm ci
npm install --no-save ../shieldlabs-js/shieldlabs-ai-js-1.0.0.tgz
npm run build && npm pack
cd examples/vite
npm install --no-save --no-package-lock ../../shieldlabs-ai-react-1.0.0.tgz ../../../shieldlabs-js/shieldlabs-ai-js-1.0.0.tgz
npm run build
```
