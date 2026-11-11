import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

await rm('dist', { recursive: true, force: true });

await Promise.all([
  build({
    ...shared,
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main/index.js',
  }),
  build({
    ...shared,
    entryPoints: ['src/preload/index.ts'],
    outfile: 'dist/preload/index.js',
  }),
]);
