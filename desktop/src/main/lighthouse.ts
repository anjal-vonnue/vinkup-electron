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
