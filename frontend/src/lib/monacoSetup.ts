import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import type { TaskRuntime } from '@itp/types';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import {
  buildMonacoTheme,
  compilerOptionsFor,
  diagnosticsFor,
  workerKindFor,
  type MonacoTokens,
  type PlainCompilerOptions,
} from './monacoConfig';

const WORKERS: Record<ReturnType<typeof workerKindFor>, new () => Worker> = {
  editor: EditorWorker,
  json: JsonWorker,
  css: CssWorker,
  html: HtmlWorker,
  ts: TsWorker,
};

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    const Ctor = WORKERS[workerKindFor(label)];
    return new Ctor();
  },
};

// Stops @monaco-editor/react from downloading monaco from a CDN.
loader.config({ monaco });

const TOKEN_CSS_VARS: Record<string, string> = {
  'editor.background': '--color-bg-base',
  'editor.foreground': '--color-text-primary',
  'editorLineNumber.foreground': '--color-text-subtle',
  'editorLineNumber.activeForeground': '--color-text-primary',
  'editor.lineHighlightBackground': '--color-overlay-highlight-6',
  'editorCursor.foreground': '--color-accent-purple-soft',
  'editor.selectionBackground': '--color-accent-purple-wash',
  'editorWidget.background': '--color-bg-card',
  'editorSuggestWidget.background': '--color-bg-card',
  tag: '--color-accent-purple-soft',
  keyword: '--color-accent-purple-soft',
  'attribute.name': '--color-accent-label',
  type: '--color-accent-label',
  'attribute.value': '--color-text-green',
  string: '--color-text-green',
  comment: '--color-text-dim',
  number: '--color-status-warning',
};

/**
 * Reads CSS variables from the root element using the requested theme.
 *
 * The application's theme variables are defined on :root[data-theme],
 * so the theme must be applied to document.documentElement when reading them.
 */
function readTokens(theme: 'light' | 'dark'): MonacoTokens {
  const root = document.documentElement;
  const previousTheme = root.dataset.theme;

  root.dataset.theme = theme;

  const styles = getComputedStyle(root);
  const tokens: MonacoTokens = {};

  for (const [key, cssVar] of Object.entries(TOKEN_CSS_VARS)) {
    tokens[key] = styles.getPropertyValue(cssVar).trim();
  }

  // Restore the application's original theme.
  if (previousTheme === undefined) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = previousTheme;
  }

  return tokens;
}

/**
 * Registers both Monaco themes using the application's CSS variables.
 */
function registerMonacoThemes(): void {
  const lightTokens = readTokens('light');
  const darkTokens = readTokens('dark');

  monaco.editor.defineTheme('itp-light', buildMonacoTheme(lightTokens, 'vs'));

  monaco.editor.defineTheme('itp-dark', buildMonacoTheme(darkTokens, 'vs-dark'));
}

/**
 * Applies the theme currently selected by the application.
 */
function applyCurrentTheme(): void {
  const isDark = document.documentElement.dataset.theme === 'dark';

  monaco.editor.setTheme(isDark ? 'itp-dark' : 'itp-light');
}

// Register both themes.
registerMonacoThemes();

// Apply the initial application theme.
applyCurrentTheme();

// Observe application theme changes.
const themeObserver = new MutationObserver(() => {
  applyCurrentTheme();
});

themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

void document.fonts.ready.then(() => monaco.editor.remeasureFonts());

const SCRIPT_TARGETS: Record<PlainCompilerOptions['target'], number> = {
  ESNext: monaco.typescript.ScriptTarget.ESNext,
};

const MODULE_KINDS: Record<PlainCompilerOptions['module'], number> = {
  ESNext: monaco.typescript.ModuleKind.ESNext,
};

const MODULE_RESOLUTIONS: Record<PlainCompilerOptions['moduleResolution'], number> = {
  NodeJs: monaco.typescript.ModuleResolutionKind.NodeJs,
};

const JSX_EMITS: Record<PlainCompilerOptions['jsx'], number> = {
  ReactJSX: monaco.typescript.JsxEmit.ReactJSX,
};

function toMonacoCompilerOptions(plain: PlainCompilerOptions) {
  return {
    target: SCRIPT_TARGETS[plain.target],
    module: MODULE_KINDS[plain.module],
    moduleResolution: MODULE_RESOLUTIONS[plain.moduleResolution],
    jsx: JSX_EMITS[plain.jsx],
    allowJs: plain.allowJs,
    allowNonTsExtensions: plain.allowNonTsExtensions,
    strict: plain.strict,
    esModuleInterop: plain.esModuleInterop,
    lib: plain.lib,
  };
}

/** Called once the task's runtime is known, so `.ts`/`.js` checking matches it. */
export function applyRuntimeSettings(runtime: TaskRuntime): void {
  const compilerOptions = toMonacoCompilerOptions(compilerOptionsFor(runtime));
  const diagnosticsOptions = diagnosticsFor(runtime);

  for (const defaults of [
    monaco.typescript.typescriptDefaults,
    monaco.typescript.javascriptDefaults,
  ]) {
    defaults.setCompilerOptions(compilerOptions);
    defaults.setDiagnosticsOptions(diagnosticsOptions);
  }
}

/**
 * For the admin code viewer. Starter files import packages the browser can't resolve, so type
 * checking would only show red squiggles on someone else's code. Opening a task in the trainee
 * workspace calls applyRuntimeSettings, which sets the options again.
 */
export function applyViewerSettings(): void {
  for (const defaults of [
    monaco.typescript.typescriptDefaults,
    monaco.typescript.javascriptDefaults,
  ]) {
    defaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
  }
}
