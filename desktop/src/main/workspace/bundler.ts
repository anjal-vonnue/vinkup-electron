import { build, transform, type Loader, type Message, type Plugin } from 'esbuild';

export type BuildIssue = {
  file: string | null;
  line: number | null;
  column: number | null; // 1-based, like the editor
  message: string;
};

const NAMESPACE = 'vinkup-workspace';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const INDEX_FILES = ['/index.ts', '/index.js'];
const LOADERS: Record<string, Loader> = {
  ts: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  js: 'js',
  css: 'css',
  json: 'json',
};

function loaderFor(filePath: string): Loader {
  const extension = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  return LOADERS[extension] ?? 'js';
}

/** 'lodash/fp' → 'lodash', '@scope/pkg/x' → '@scope/pkg' */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function findWorkspaceFile(files: Record<string, string>, filePath: string): string | null {
  const candidates = [
    filePath,
    ...EXTENSIONS.map((extension) => filePath + extension),
    ...INDEX_FILES.map((index) => filePath + index),
    // TypeScript style: `import './utils.js'` means utils.ts
    ...(/\.jsx?$/.test(filePath) ? [filePath.replace(/\.js(x?)$/, '.ts$1')] : []),
  ];
  return candidates.find((candidate) => candidate in files) ?? null;
}

/** Resolves a relative reference the same way the browser runtime always has. */
export function resolveWorkspacePath(fromFile: string, reference: string): string | null {
  const trimmed = reference.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;
  if (/^([a-z][a-z\d+.-]*:|\/\/)/i.test(trimmed)) return null;

  const withoutSuffix = trimmed.split(/[?#]/)[0];
  if (withoutSuffix === '') return null;

  let decoded = withoutSuffix;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    // a stray % — keep the text as written
  }

  const parts = decoded.startsWith('/') ? [] : fromFile.split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }

  return parts.length > 0 ? parts.join('/') : null;
}

/** Reads every import from the workspace files, never from disk or the network. */
function workspacePlugin(files: Record<string, string>, htmlPath: string | null): Plugin {
  return {
    name: 'vinkup-workspace',
    setup(buildApi) {
      buildApi.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') {
          return args.path in files
            ? { path: args.path, namespace: NAMESPACE }
            : { errors: [{ text: `Cannot find '${args.path}'` }] };
        }

        const importer = args.namespace === NAMESPACE ? args.importer : (htmlPath ?? '');
        const importerLabel =
          args.namespace === NAMESPACE ? args.importer : `${htmlPath ?? ''} (inline module)`;

        if (/^\.{0,2}\//.test(args.path)) {
          const resolved = resolveWorkspacePath(importer, args.path);
          const found = resolved === null ? null : findWorkspaceFile(files, resolved);
          if (found) return { path: found, namespace: NAMESPACE };
          return {
            errors: [{ text: `Cannot find '${args.path}' (imported from ${importerLabel})` }],
          };
        }

        if (/^([a-z][a-z\d+.-]*:|\/\/)/i.test(args.path)) {
          return {
            errors: [{ text: `Imports from URLs aren't supported in the preview: ${args.path}` }],
          };
        }

        return {
          errors: [
            {
              text: `"${packageName(args.path)}" is an npm package. npm packages need a Node task.`,
            },
          ],
        };
      });

      buildApi.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => ({
        contents: files[args.path] ?? '',
        loader: loaderFor(args.path),
      }));
    },
  };
}

function toIssue(message: Message): BuildIssue {
  const location = message.location;
  return {
    file: location ? location.file.replace(/^vinkup-workspace:/, '') : null,
    line: location ? location.line : null,
    column: location ? location.column + 1 : null,
    message: message.text,
  };
}

export function toIssues(error: unknown): BuildIssue[] {
  if (error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)) {
    const errors = error.errors as Message[];
    if (errors.length > 0) return errors.map(toIssue);
  }
  const message = error instanceof Error ? error.message : String(error);
  return [{ file: null, line: null, column: null, message }];
}

/** `src/App.tsx:4:10 — Cannot find './missing'` */
export function formatIssue(issue: BuildIssue): string {
  const location = [issue.file, issue.line, issue.column].filter((part) => part !== null).join(':');
  return location ? `${location} — ${issue.message}` : issue.message;
}

/** Bundles an ES module entry (a workspace file, or inline code from an HTML file) into one IIFE. */
export async function bundleModule(
  files: Record<string, string>,
  entry: { path: string } | { inlineCode: string; htmlPath: string }
): Promise<{ ok: true; js: string; css: string } | { ok: false; issues: BuildIssue[] }> {
  try {
    const isInline = 'inlineCode' in entry;
    const result = await build({
      ...(isInline
        ? {
            stdin: {
              contents: entry.inlineCode,
              sourcefile: `${entry.htmlPath} (inline module)`,
              loader: 'js',
            },
          }
        : { entryPoints: [entry.path] }),
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2020',
      sourcemap: 'inline',
      outdir: '/out',
      logLevel: 'silent',
      plugins: [workspacePlugin(files, isInline ? entry.htmlPath : null)],
    });

    const output = result.outputFiles ?? [];
    return {
      ok: true,
      js: output.find((file) => file.path.endsWith('.js'))?.text ?? '',
      css: output.find((file) => file.path.endsWith('.css'))?.text ?? '',
    };
  } catch (error) {
    return { ok: false, issues: toIssues(error) };
  }
}

/** Strips types from a classic (non-module) .ts script, keeping top-level names global. */
export async function transformClassicScript(
  code: string,
  filePath: string
): Promise<{ ok: true; js: string } | { ok: false; issues: BuildIssue[] }> {
  try {
    // No `format`: top-level function and var stay global, so plain <script> files can share them.
    const result = await transform(code, {
      loader: 'ts',
      sourcefile: filePath,
      target: 'es2020',
    });
    return { ok: true, js: result.code };
  } catch (error) {
    return { ok: false, issues: toIssues(error) };
  }
}

/** JavaScript that reports a failed build in the page's console (the bridge forwards it). */
export function buildErrorScript(issues: BuildIssue[]): string {
  const text = ['Build failed', ...issues.map(formatIssue)].join('\n');
  return `console.error(${JSON.stringify(text)});\n`;
}
