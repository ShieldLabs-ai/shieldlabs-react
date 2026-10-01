import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2019',
  tsconfig: 'tsconfig.build.json',
  // React and @shieldlabs-ai/js are peer dependencies and stay external.
  external: ['react', '@shieldlabs-ai/js'],
  // Marks every built file as a client module, so the Next.js App Router can import the package
  // from server components. The directive must be the first statement of each output file.
  banner: { js: '"use client";' },
});
