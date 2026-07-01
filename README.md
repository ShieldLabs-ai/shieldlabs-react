# @shieldlabs/react

React bindings for the [ShieldLabs browser loader](https://github.com/ShieldLabs-ai/shieldlabs-js).

> **Pre-launch.** This package is a placeholder to reserve the name and shape the public API. It is not published yet and the surface will change. Follow along at [shieldlabs.ai](https://shieldlabs.ai).

## Install

```bash
npm install @shieldlabs/react   # coming soon
```

## Usage (subject to change)

```tsx
import { useShieldLabs } from "@shieldlabs/react";

function App() {
  const { data, isLoading } = useShieldLabs({ apiKey: "pk_live_..." });
  if (isLoading) return null;
  return <span>risk score: {data?.riskScore}</span>;
}
```

## About ShieldLabs

ShieldLabs gives you identification and anonymity detection with an explainable risk score (0-100) and detailed signals, so you can assess traffic quality and act on abuse and fraud in your own code. You read the score and its details; your code owns the decision. You set the rules.

- Website: [shieldlabs.ai](https://shieldlabs.ai)
- Get started: [Start Free](https://shieldlabs.ai)

## License

[MIT](./LICENSE)
