// @vitest-environment node
// Checks the built files (`npm test` builds first): the "use client" directive, the exports of both
// formats, the declarations, and server rendering with the real @shieldlabs-ai/js.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PUBLIC_KEY } from './support/agent';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const EXPORTS = ['ShieldLabsError', 'ShieldLabsProvider', 'useIdentify', 'useShieldLabs'];

type Api = typeof import('../src');

function read(file: string): string {
  return readFileSync(new URL(file, root), 'utf8');
}

/** Server-renders a provider with a component that uses both hooks, from one build of the package. */
function renderWith(api: Api): string {
  const { createElement } = require('react') as typeof import('react');
  const { renderToString } = require('react-dom/server') as typeof import('react-dom/server');
  function Probe() {
    const { status, load: loadAgent, getAgent } = api.useShieldLabs();
    const { isLoading } = api.useIdentify({ runOnMount: true });
    return createElement('span', null, [status, String(isLoading), typeof loadAgent, typeof getAgent].join(' '));
  }
  return renderToString(createElement(api.ShieldLabsProvider, { publicKey: PUBLIC_KEY, checkOnLoad: true }, createElement(Probe)));
}

describe('built package', () => {
  it.each(['dist/index.js', 'dist/index.cjs'])('%s starts with the "use client" directive', (file) => {
    expect(read(file).startsWith('"use client";\n')).toBe(true);
  });

  it('keeps React and @shieldlabs-ai/js external', () => {
    const esm = read('dist/index.js');
    expect(esm).toContain('from "react"');
    expect(esm).toContain('from "@shieldlabs-ai/js"');
    const cjs = read('dist/index.cjs');
    expect(cjs).toContain('require("react")');
    expect(cjs).toContain('require("@shieldlabs-ai/js")');
  });

  it('the CommonJS build exports the public API and the ShieldLabsError of @shieldlabs-ai/js', () => {
    const api = require('../dist/index.cjs') as Api;
    expect(Object.keys(api).sort()).toEqual(EXPORTS);
    const core = require('@shieldlabs-ai/js') as typeof import('@shieldlabs-ai/js');
    expect(api.ShieldLabsError).toBe(core.ShieldLabsError);
    expect(renderWith(api)).toBe('<span>loading true function function</span>');
  });

  it('the ES module build exports the public API and the ShieldLabsError of @shieldlabs-ai/js', async () => {
    // A computed specifier: the type check runs before the build, when dist/ does not exist yet.
    const esm = new URL('dist/index.js', root).href;
    const api = (await import(/* @vite-ignore */ esm)) as Api;
    expect(Object.keys(api).sort()).toEqual(EXPORTS);
    const core = await import('@shieldlabs-ai/js');
    expect(api.ShieldLabsError).toBe(core.ShieldLabsError);
  });

  it.each(['dist/index.d.ts', 'dist/index.d.cts'])('%s declares the public API', (file) => {
    const types = read(file);
    for (const name of [
      'ShieldLabsProvider',
      'ShieldLabsProviderProps',
      'ShieldLabsStatus',
      'UseShieldLabsResult',
      'useShieldLabs',
      'useIdentify',
      'UseIdentifyOptions',
      'UseIdentifyResult',
      'ShieldLabsError',
      'IdentifyOptions',
      'IdentifyResult',
      'InteractionIdentifier',
      'LoadOptions',
      'ShieldLabsAgent',
      'ShieldLabsErrorCode',
    ]) {
      expect(types).toMatch(new RegExp('\\b' + name + '\\b'));
    }
  });
});
