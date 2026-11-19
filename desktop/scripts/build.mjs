import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['electron', 'esbuild', 'node-pty', 'lighthouse', 'chrome-launcher'],
  logLevel: 'info',
};

const referenceAssetPlugin = {
  name: 'reference-asset-paths',
  setup(referenceBuild) {
    referenceBuild.onLoad({ filter: /\.(?:png|jpe?g|webp|gif|svg)$/i }, ({ path }) => {
      const sourcePath = relative(resolve('../frontend/src'), path).split(sep).join('/');
      return {
        contents: `export default ${JSON.stringify(`/src/${sourcePath}`)};`,
        loader: 'js',
      };
    });
  },
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
  build({
    ...shared,
    entryPoints: ['src/preload/alert.ts'],
    outfile: 'dist/preload/alert.js',
  }),
  build({
    ...shared,
    entryPoints: ['src/preload/overlay.ts'],
    outfile: 'dist/preload/overlay.js',
  }),
  build({
    entryPoints: ['../frontend/src/content/data/secondaryDisplayReferences.ts'],
    outfile: 'dist/main/reference-data.js',
    bundle: true,
    platform: 'browser',
    target: 'chrome120',
    format: 'iife',
    globalName: 'SecondaryDisplayReferenceData',
    minify: true,
    plugins: [referenceAssetPlugin],
    logLevel: 'info',
  }),
]);

await mkdir('dist/main', { recursive: true });
await Promise.all([
  cp('src/main/overlay.html', 'dist/main/overlay.html'),
  cp('src/main/overlay-references.js', 'dist/main/overlay-references.js'),
  cp('src/main/alert.html', 'dist/main/alert.html'),
  cp('../frontend/src/content/assets', 'dist/main/reference-assets', { recursive: true }),
]);
