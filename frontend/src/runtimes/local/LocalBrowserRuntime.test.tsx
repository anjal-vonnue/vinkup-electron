import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { DesktopApi, LighthouseAuditResult, WorkspaceApi, WorkspaceEvent } from '@itp/types';

import { taskCodeFixture, taskFixture } from '../../test/fixtures/task';
import { WorkspaceProvider } from '../../pages/TaskPage/state/WorkspaceContext';
import { RunnerProvider, useRunner } from '../runnerContext';
import LocalBrowserRuntime from './LocalBrowserRuntime';

const PREVIEW_URL = 'http://127.0.0.1:4100';

let listeners: Array<(event: WorkspaceEvent) => void> = [];
let workspaceApi: WorkspaceApi;
let auditRun: ReturnType<typeof vi.fn>;

const auditFixture = {
  url: 'http://localhost:4100/services.html',
  fetchedAt: '2026-11-18T10:00:00.000Z',
  scores: {
    performance: 0.92,
    accessibility: 0.78,
    'best-practices': 0.45,
    seo: null,
  },
  audits: [
    {
      id: 'first-contentful-paint',
      title: 'First Contentful Paint',
      score: 0.92,
      displayValue: '1.2 s',
      scoreDisplayMode: 'numeric',
      description: 'The first contentful paint was fast.',
    },
    {
      id: 'color-contrast',
      title: 'Background and foreground colors do not have a sufficient contrast ratio.',
      score: 0.78,
      displayValue: '',
      scoreDisplayMode: 'binary',
      description: 'Improve the contrast between text and its background.',
    },
    {
      id: 'uses-https',
      title: 'Uses HTTPS',
      score: 0.45,
      displayValue: '',
      scoreDisplayMode: 'binary',
      description: 'The page should use HTTPS.',
    },
    {
      id: 'robots-txt',
      title: 'robots.txt is valid',
      score: null,
      displayValue: '',
      scoreDisplayMode: 'informative',
      description: 'This audit provides additional information.',
    },
  ],
} satisfies LighthouseAuditResult;

/**
 * Builds a result with exactly the audits a test cares about. `category`, `group` and
 * `groupTitle` are what the main process can send along; they are optional, so tests
 * can leave them out to exercise the built-in fallback table.
 */
type RawAudit = {
  id: string;
  title: string;
  score: number | null;
  category?: string;
  group?: string;
  groupTitle?: string;
};

function auditWith(...audits: RawAudit[]): LighthouseAuditResult {
  return {
    ...auditFixture,
    audits: audits.map((audit) => ({
      displayValue: '',
      scoreDisplayMode: audit.score === null ? 'informative' : 'binary',
      description: `About ${audit.title}.`,
      ...audit,
    })),
  };
}

function RunnerProbe() {
  const { canRun, label, run } = useRunner();

  return (
    <>
      <output data-testid="runner" data-can-run={String(canRun)} data-label={label} />
      <button type="button" onClick={run}>
        probe run
      </button>
    </>
  );
}

function renderRuntime() {
  return render(
    <WorkspaceProvider code={taskCodeFixture}>
      <RunnerProvider>
        <LocalBrowserRuntime task={taskFixture} isVisible />
        <RunnerProbe />
      </RunnerProvider>
    </WorkspaceProvider>
  );
}

function emit(event: WorkspaceEvent): void {
  act(() => {
    for (const listener of listeners) {
      listener(event);
    }
  });
}

async function waitForPreview() {
  const frame = await screen.findByTitle('Preview of services.html');

  await waitFor(() => {
    expect(screen.getByTestId('runner').dataset.canRun).toBe('true');
  });

  return frame;
}

async function runLighthouseAudit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', {
      name: 'Run Lighthouse audit',
    })
  );
}

/** Renders the runtime, runs the audit with `result`, and waits for the results view. */
async function showAudit(user: ReturnType<typeof userEvent.setup>, result: LighthouseAuditResult) {
  auditRun.mockResolvedValueOnce(result);

  renderRuntime();

  await waitForPreview();
  await runLighthouseAudit(user);

  await screen.findByRole('heading', { name: 'Lighthouse results' });
}

/** The category headings inside "Needs attention", in display order. */
function categoryHeadings(): string[] {
  return screen.queryAllByRole('heading', { level: 6 }).map((heading) => heading.textContent ?? '');
}

/** Finding ids in the order they are rendered. */
function findingIds(): string[] {
  // Rows carry their Lighthouse id as data-audit-id; there is no role to query them by.
  return Array.from(document.querySelectorAll('details[data-audit-id]')).map(
    (row) => row.getAttribute('data-audit-id') ?? ''
  );
}

beforeEach(() => {
  window.localStorage.clear();
  listeners = [];

  auditRun = vi.fn().mockResolvedValue(auditFixture);

  workspaceApi = {
    open: vi.fn(() =>
      Promise.resolve({
        previewUrl: PREVIEW_URL,
        nodeVersion: '24.0.0',
        error: null,
      })
    ),
    sync: vi.fn(() => Promise.resolve()),
    reload: vi.fn(() => Promise.resolve({})),
    close: vi.fn(() => Promise.resolve()),
    getEnvironment: vi.fn(() =>
      Promise.resolve({
        nodeVersion: '24.0.0',
        error: null,
      })
    ),
    onEvent: (listener) => {
      listeners.push(listener);

      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener);
      };
    },
  };

  window.desktop = {
    workspace: workspaceApi,
    audit: {
      run: auditRun,
    },
  } as unknown as DesktopApi;
});

afterEach(() => {
  delete (window as { desktop?: DesktopApi }).desktop;
  vi.clearAllMocks();
});

describe('LocalBrowserRuntime', () => {
  it('opens the workspace with the task files and serves the entry over loopback', async () => {
    renderRuntime();

    await waitFor(() => {
      expect(workspaceApi.open).toHaveBeenCalledTimes(1);
    });

    const openArgs = vi.mocked(workspaceApi.open).mock.calls[0]?.[0];

    expect(openArgs?.taskId).toBe('t1');
    expect(typeof openArgs?.files['services.html']).toBe('string');

    const frame = await screen.findByTitle('Preview of services.html');
    const src = frame.getAttribute('src') ?? '';

    expect(src).toContain(`${PREVIEW_URL}/services.html?`);
    expect(src).toContain('run=');
    expect(src).toContain(`parent=${encodeURIComponent(window.location.origin)}`);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-modals allow-forms');

    await waitFor(() => {
      expect(screen.getByTestId('runner').dataset.canRun).toBe('true');
    });
  });

  it('adds console messages and DOM readiness from workspace events', async () => {
    const user = userEvent.setup();
    renderRuntime();

    const frame = await screen.findByTitle('Preview of services.html');
    const runId = new URL(frame.getAttribute('src') ?? '').searchParams.get('run') ?? '';

    expect(runId).not.toBe('');

    emit({
      type: 'console',
      taskId: 't1',
      runId,
      level: 'error',
      args: ['boom'],
      ts: 1,
    });

    emit({
      type: 'preview-ready',
      taskId: 't1',
      runId,
      url: `${PREVIEW_URL}/services.html`,
    });

    expect(await screen.findByText('DOM Ready')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /console/i }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /console/i })).toHaveTextContent('1');
  });

  it('ignores console output from an older run', async () => {
    const user = userEvent.setup();
    renderRuntime();

    await screen.findByTitle('Preview of services.html');

    emit({
      type: 'console',
      taskId: 't1',
      runId: 'stale-run',
      level: 'error',
      args: ['old'],
      ts: 1,
    });

    await user.click(screen.getByRole('tab', { name: /console/i }));

    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });

  it('writes pending editor files before starting a new run', async () => {
    const user = userEvent.setup();
    renderRuntime();

    const firstFrame = await screen.findByTitle('Preview of services.html');
    const firstSrc = firstFrame.getAttribute('src');

    await waitFor(() => {
      expect(screen.getByTestId('runner').dataset.canRun).toBe('true');
    });

    vi.mocked(workspaceApi.sync).mockClear();

    await user.click(screen.getByRole('button', { name: 'probe run' }));

    await waitFor(() => {
      expect(workspaceApi.sync).toHaveBeenCalled();
    });

    // A debounced editor sync may also happen, so check the contents
    // rather than relying on an exact call count.
    const synced = vi.mocked(workspaceApi.sync).mock.calls.at(-1)?.[0];

    expect(synced?.taskId).toBe('t1');
    expect(typeof synced?.files['services.html']).toBe('string');

    await waitFor(() => {
      const src = screen.getByTitle('Preview of services.html').getAttribute('src');

      expect(src).not.toBe(firstSrc);
    });
  });

  it('disables the Lighthouse audit until the preview is ready', async () => {
    renderRuntime();

    const auditButton = screen.getByRole('button', {
      name: 'Run Lighthouse audit',
    });

    expect(auditButton).toBeDisabled();

    await waitForPreview();

    expect(auditButton).toBeEnabled();
  });

  it('runs a Lighthouse audit and displays the category scores', async () => {
    const user = userEvent.setup();
    renderRuntime();

    await waitForPreview();

    await runLighthouseAudit(user);

    expect(
      await screen.findByRole('heading', {
        name: 'Lighthouse results',
      })
    ).toBeInTheDocument();

    expect(auditRun).toHaveBeenCalledTimes(1);
    expect(auditRun).toHaveBeenCalledWith('t1', 'services.html');

    expect(
      screen.getByRole('img', {
        name: /Performance: 92 out of 100, Good/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('img', {
        name: /Accessibility: 78 out of 100, Needs improvement/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('img', {
        name: /Best Practices: 45 out of 100, Poor/i,
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('img', {
        name: /SEO: no score/i,
      })
    ).toBeInTheDocument();
  });

  it('groups audit findings into attention, passed, and information', async () => {
    const user = userEvent.setup();
    renderRuntime();

    await waitForPreview();
    await runLighthouseAudit(user);

    const attentionHeading = await screen.findByText('Needs attention');

    expect(attentionHeading).toBeInTheDocument();

    expect(
      screen.getByText('Background and foreground colors do not have a sufficient contrast ratio.')
    ).toBeInTheDocument();

    const passedSummary = screen.getByText('Passed');
    const informationSummary = screen.getByText('Information');

    expect(passedSummary).toBeInTheDocument();
    expect(informationSummary).toBeInTheDocument();

    await user.click(passedSummary);

    expect(await screen.findByText('First Contentful Paint')).toBeInTheDocument();

    await user.click(informationSummary);

    expect(await screen.findByText('robots.txt is valid')).toBeInTheDocument();
  });

  it('shows a loading state while the Lighthouse audit is running', async () => {
    const user = userEvent.setup();

    let resolveAudit!: (result: LighthouseAuditResult) => void;

    const pendingAudit = new Promise<LighthouseAuditResult>((resolve) => {
      resolveAudit = resolve;
    });

    auditRun.mockReturnValueOnce(pendingAudit);

    renderRuntime();

    await waitForPreview();
    await runLighthouseAudit(user);

    expect(await screen.findByText('Running Lighthouse audit…')).toBeInTheDocument();

    expect(
      screen.getByRole('button', {
        name: 'Run Lighthouse audit',
      })
    ).toBeDisabled();

    act(() => {
      resolveAudit(auditFixture);
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Lighthouse results',
      })
    ).toBeInTheDocument();
  });

  it('shows an error when the Lighthouse audit fails', async () => {
    const user = userEvent.setup();

    auditRun.mockRejectedValueOnce(new Error('Lighthouse service unavailable'));

    renderRuntime();

    await waitForPreview();
    await runLighthouseAudit(user);

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('The audit could not run');
    expect(alert).toHaveTextContent('Lighthouse service unavailable');
  });

  it('allows retrying a failed Lighthouse audit', async () => {
    const user = userEvent.setup();

    auditRun
      .mockRejectedValueOnce(new Error('Temporary audit failure'))
      .mockResolvedValueOnce(auditFixture);

    renderRuntime();

    await waitForPreview();
    await runLighthouseAudit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Temporary audit failure');

    await user.click(
      screen.getByRole('button', {
        name: /try again/i,
      })
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Lighthouse results',
      })
    ).toBeInTheDocument();

    expect(auditRun).toHaveBeenCalledTimes(2);
  });

  it('flushes pending workspace changes before running a Lighthouse audit', async () => {
    const user = userEvent.setup();
    renderRuntime();

    await waitForPreview();

    vi.mocked(workspaceApi.sync).mockClear();

    await runLighthouseAudit(user);

    await waitFor(() => {
      expect(auditRun).toHaveBeenCalledWith('t1', 'services.html');
    });

    expect(workspaceApi.sync).toHaveBeenCalled();
  });

  it('allows running the audit again from the results view', async () => {
    const user = userEvent.setup();
    renderRuntime();

    await waitForPreview();
    await runLighthouseAudit(user);

    expect(
      await screen.findByRole('heading', {
        name: 'Lighthouse results',
      })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: /run again/i,
      })
    );

    await waitFor(() => {
      expect(auditRun).toHaveBeenCalledTimes(2);
    });
  });

  it('renders an empty state when the audit contains no findings', async () => {
    const user = userEvent.setup();

    auditRun.mockResolvedValueOnce({
      ...auditFixture,
      audits: [],
    });

    renderRuntime();

    await waitForPreview();
    await runLighthouseAudit(user);

    expect(await screen.findByText('No audit findings available.')).toBeInTheDocument();
  });

  it('shows how many findings need attention in the section heading', async () => {
    const user = userEvent.setup();

    await showAudit(user, auditFixture);

    // color-contrast (0.78) and uses-https (0.45) are below the 0.9 pass mark.
    expect(screen.getByRole('heading', { name: 'Needs attention 2' })).toBeInTheDocument();
  });

  it('treats a score of 0.9 as passed, matching Lighthouse', async () => {
    const user = userEvent.setup();

    await showAudit(user, auditWith({ id: 'doctype', title: 'Has a doctype', score: 0.9 }));

    expect(screen.queryByRole('heading', { name: /^Needs attention/ })).not.toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });

  it('exposes the Lighthouse id on each finding row', async () => {
    const user = userEvent.setup();

    await showAudit(user, auditFixture);

    expect(findingIds()).toEqual(
      expect.arrayContaining(['color-contrast', 'uses-https', 'first-contentful-paint'])
    );
  });
});

describe('LocalBrowserRuntime Lighthouse grouping', () => {
  it('groups failing audits under category and group headings when the data has neither', async () => {
    const user = userEvent.setup();

    // Same shape the main process sends today: no category or group fields.
    await showAudit(
      user,
      auditWith(
        { id: 'errors-in-console', title: 'Browser errors were logged to the console', score: 0 },
        { id: 'meta-description', title: 'Document does not have a meta description', score: 0 },
        { id: 'landmark-one-main', title: 'Document does not have a main landmark.', score: 0 }
      )
    );

    expect(categoryHeadings()).toEqual(['Accessibility', 'Best Practices', 'SEO']);

    expect(screen.getByText('Best practices')).toBeInTheDocument(); // Accessibility group
    expect(screen.getByText('General')).toBeInTheDocument(); // Best Practices group
    expect(screen.getByText('Content Best Practices')).toBeInTheDocument(); // SEO group
  });

  it('uses Chrome-style group titles for accessibility audits', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith(
        { id: 'button-name', title: 'Buttons do not have an accessible name', score: 0 },
        { id: 'color-contrast', title: 'Low contrast text', score: 0 },
        { id: 'html-has-lang', title: '<html> element does not have a [lang] attribute', score: 0 }
      )
    );

    expect(categoryHeadings()).toEqual(['Accessibility']);

    expect(screen.getByText('Names and labels')).toBeInTheDocument();
    expect(screen.getByText('Contrast')).toBeInTheDocument();
    expect(screen.getByText('Internationalization and localization')).toBeInTheDocument();
  });

  it('prefers category and group sent by the main process over the built-in table', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith({
        // color-contrast is an accessibility audit in the table; the data says otherwise.
        id: 'color-contrast',
        title: 'Low contrast text',
        score: 0,
        category: 'seo',
        group: 'seo-content',
        groupTitle: 'Content from the data',
      })
    );

    expect(categoryHeadings()).toEqual(['SEO']);
    expect(screen.getByText('Content from the data')).toBeInTheDocument();
    expect(screen.queryByText('Contrast')).not.toBeInTheDocument();
  });

  it('places audits the table does not know in a group the main process names', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith({
        id: 'brand-new-audit',
        title: 'A check added in a newer Lighthouse',
        score: 0,
        category: 'best-practices',
        group: 'brand-new-group',
        groupTitle: 'Brand new group',
      })
    );

    expect(categoryHeadings()).toEqual(['Best Practices']);
    expect(screen.getByText('Brand new group')).toBeInTheDocument();
  });

  it('titles an unknown group from its id when no title is sent', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith({
        id: 'brand-new-audit',
        title: 'A check added in a newer Lighthouse',
        score: 0,
        category: 'accessibility',
        group: 'a11y-new-things',
      })
    );

    expect(screen.getByText('New things')).toBeInTheDocument();
  });

  it('puts performance insight audits under Performance > Insights', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith(
        { id: 'render-blocking-insight', title: 'Render-blocking requests', score: 0.5 },
        { id: 'unminified-javascript', title: 'Minify JavaScript', score: 0.4 }
      )
    );

    expect(categoryHeadings()).toEqual(['Performance']);

    expect(screen.getByText('Insights')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });

  it('orders categories as Performance, Accessibility, Best Practices, SEO', async () => {
    const user = userEvent.setup();

    // Deliberately given in the wrong order.
    await showAudit(
      user,
      auditWith(
        { id: 'meta-description', title: 'No meta description', score: 0 },
        { id: 'errors-in-console', title: 'Console errors', score: 0 },
        { id: 'color-contrast', title: 'Low contrast', score: 0 },
        { id: 'unminified-javascript', title: 'Minify JavaScript', score: 0.4 }
      )
    );

    expect(categoryHeadings()).toEqual(['Performance', 'Accessibility', 'Best Practices', 'SEO']);
  });

  it('shows the worst finding first inside a group', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith(
        { id: 'image-alt', title: 'Images lack alt text', score: 0.6 },
        { id: 'button-name', title: 'Buttons lack a name', score: 0 },
        { id: 'link-name', title: 'Links lack a name', score: 0.3 }
      )
    );

    // All three are "Names and labels".
    expect(findingIds()).toEqual(['button-name', 'link-name', 'image-alt']);
  });

  it('puts audits it cannot place under Other, after the known categories', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith(
        { id: 'something-unmapped', title: 'Something unmapped', score: 0 },
        { id: 'errors-in-console', title: 'Console errors', score: 0 }
      )
    );

    expect(categoryHeadings()).toEqual(['Best Practices', 'Other']);
    expect(screen.getByText('Something unmapped')).toBeInTheDocument();
  });

  it('keeps a flat list, without category headings, when nothing can be placed', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith(
        { id: 'unmapped-one', title: 'Unmapped one', score: 0 },
        { id: 'unmapped-two', title: 'Unmapped two', score: 0.2 }
      )
    );

    expect(categoryHeadings()).toEqual([]);
    expect(screen.getByText('Unmapped one')).toBeInTheDocument();
    expect(screen.getByText('Unmapped two')).toBeInTheDocument();
  });

  it('does not group passed or informational findings', async () => {
    const user = userEvent.setup();

    await showAudit(
      user,
      auditWith(
        { id: 'color-contrast', title: 'Low contrast', score: 0 },
        { id: 'doctype', title: 'Has a doctype', score: 1 },
        { id: 'robots-txt', title: 'robots.txt is valid', score: null }
      )
    );

    // Only the one failing audit creates a category heading.
    expect(categoryHeadings()).toEqual(['Accessibility']);

    await user.click(screen.getByText('Passed'));
    await user.click(screen.getByText('Information'));

    expect(screen.getByText('Has a doctype')).toBeInTheDocument();
    expect(screen.getByText('robots.txt is valid')).toBeInTheDocument();
    expect(categoryHeadings()).toEqual(['Accessibility']);
  });
});
