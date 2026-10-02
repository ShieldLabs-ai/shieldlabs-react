// Runs before the type check, lint and build. `npm ci` leaves out the peer dependency @shieldlabs-ai/js
// (see .npmrc), and the tools would fail with "Cannot find module '@shieldlabs-ai/js'". This check names
// the missing step instead (see CONTRIBUTING.md).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let version = null;
try {
  version = JSON.parse(readFileSync(require.resolve('@shieldlabs-ai/js/package.json'), 'utf8')).version;
} catch {
  // Not installed.
}

if (typeof version !== 'string' || !version.startsWith('1.')) {
  const found = typeof version === 'string' ? 'Found @shieldlabs-ai/js ' + version + '.' : 'It is not installed.';
  console.error(
    [
      '@shieldlabs-ai/react needs @shieldlabs-ai/js 1.x, a peer dependency. ' + found,
      'Install the published peer from this repository root (repeat after every npm ci):',
      '',
      "  npm install --no-save --legacy-peer-deps=false '@shieldlabs-ai/js@^1.0.0'",
      '',
      'See CONTRIBUTING.md.',
    ].join('\n'),
  );
  process.exit(1);
}
