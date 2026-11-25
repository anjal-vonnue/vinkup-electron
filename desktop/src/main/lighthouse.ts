type LighthouseCategory = 'performance' | 'accessibility' | 'best-practices' | 'seo';

export type LighthouseAuditResult = {
  url: string;
  fetchedAt: string;
  scores: Record<LighthouseCategory, number | null>;
  audits: Array<{
    id: string;
    title: string;
    description: string;
    score: number | null;
    displayValue?: string;
    scoreDisplayMode: string;
  }>;
};

type ChromeLauncherModule = {
  launch: (options: { chromeFlags: string[]; chromePath?: string }) => Promise<{
    port: number;
    kill: () => Promise<void>;
  }>;
};

type LighthouseModule = {
  default: (
    url: string,
    options: {
      port: number;
      output: 'json';
      logLevel: 'error';
      onlyCategories: string[];
    }
  ) => Promise<{
    lhr: {
      runtimeError?: { code: string; message: string };
      finalDisplayedUrl: string;
      categories: Record<string, { score: number | null }>;
      audits: Record<
        string,
        {
          id: string;
          title: string;
          description: string;
          score: number | null;
          displayValue?: string;
          scoreDisplayMode: string;
        }
      >;
    } | null;
  } | null>;
};

const CATEGORIES: LighthouseCategory[] = ['performance', 'accessibility', 'best-practices', 'seo'];

// Keep dynamic imports external to the CommonJS Electron bundle.
async function loadModule(specifier: string): Promise<unknown> {
  switch (specifier) {
    case 'chrome-launcher':
      return import('chrome-launcher');

    case 'lighthouse':
      return import('lighthouse');

    default:
      throw new Error(`Unsupported module: ${specifier}`);
  }
}

function assertLoopbackUrl(value: string): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid preview URL.');
  }

  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

  if (url.protocol !== 'http:' || !allowedHosts.has(url.hostname)) {
    throw new Error('Lighthouse can only audit a local workspace preview.');
  }
}

const RUNTIME_ERROR_MESSAGES: Record<string, string> = {
  NO_FCP: 'The page did not paint any content. Add visible content to the page and try again.',
  NO_LCP: 'The page has no visible content to measure. Add some content and try again.',
  PAGE_HUNG: 'The page stopped responding during the audit. Check your scripts for infinite loops.',
  FAILED_DOCUMENT_REQUEST:
    'The page could not be loaded. Make sure the file exists and the preview is running.',
  ERRORED_DOCUMENT_REQUEST:
    'The page could not be loaded. Make sure the file exists and the preview is running.',
  PROTOCOL_TIMEOUT: 'The audit timed out. Try again, and check your page for very slow scripts.',
};

/** Joins the preview base URL with a workspace-relative .html path chosen in the UI. */
export function buildAuditUrl(baseUrl: string, pagePath: unknown): string {
  if (pagePath === undefined || pagePath === null || pagePath === '') return baseUrl;

  const segments = typeof pagePath === 'string' ? pagePath.split('/') : [];
  const valid =
    typeof pagePath === 'string' &&
    pagePath.length <= 500 &&
    /\.html?$/i.test(pagePath) &&
    !pagePath.includes('\\') &&
    !pagePath.includes('\0') &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');

  if (!valid) throw new Error('Invalid page selected for the Lighthouse audit.');

  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(segments.map(encodeURIComponent).join('/'), base).toString();
}

export async function runLighthouseAudit(url: string): Promise<LighthouseAuditResult> {
  assertLoopbackUrl(url);

  const [chromeModule, lighthouseModule] = await Promise.all([
    loadModule('chrome-launcher'),
    loadModule('lighthouse'),
  ]);

  const chromeLauncher = chromeModule as ChromeLauncherModule;
  const lighthouse = lighthouseModule as LighthouseModule;

  let chrome: Awaited<ReturnType<ChromeLauncherModule['launch']>> | null = null;

  try {
    chrome = await chromeLauncher.launch({
      chromePath: process.env.CHROME_PATH || undefined,
      chromeFlags: ['--headless', '--disable-dev-shm-usage'],
    });

    const result = await lighthouse.default(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: CATEGORIES,
    });

    const lhr = result?.lhr;

    if (!lhr) {
      throw new Error('Lighthouse did not return an audit report.');
    }

    if (lhr.runtimeError) {
      console.error('[lighthouse] runtime error', lhr.runtimeError.code, lhr.runtimeError.message);
      throw new Error(
        RUNTIME_ERROR_MESSAGES[lhr.runtimeError.code] ??
          `Lighthouse could not analyse this page (${lhr.runtimeError.code}).`
      );
    }

    return {
      url: lhr.finalDisplayedUrl,
      fetchedAt: new Date().toISOString(),
      scores: {
        performance: lhr.categories.performance?.score ?? null,
        accessibility: lhr.categories.accessibility?.score ?? null,
        'best-practices': lhr.categories['best-practices']?.score ?? null,
        seo: lhr.categories.seo?.score ?? null,
      },
      audits: Object.values(lhr.audits)
        .filter((audit) => audit.scoreDisplayMode !== 'notApplicable')
        .map((audit) => ({
          id: audit.id,
          title: audit.title,
          description: audit.description,
          score: audit.score,
          displayValue: audit.displayValue,
          scoreDisplayMode: audit.scoreDisplayMode,
        })),
    };
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch (error) {
        console.error('[lighthouse] Failed to close Chrome:', error);
      }
    }
  }
}
