import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import PreviewFrame from './PreviewFrame';

function renderFrame() {
  const iframeRef = createRef<HTMLIFrameElement>();
  render(
    <PreviewFrame
      srcdoc="<p>Hello</p>"
      runId="run-1"
      entryPath="index.html"
      iframeRef={iframeRef}
    />
  );
  return { iframe: screen.getByTitle('Preview of index.html'), iframeRef };
}

describe('PreviewFrame', () => {
  // Security regression test. If this fails because someone added allow-same-origin, don't
  // "fix" the test: trainee code would run as the platform and could call /api as the trainee.
  it('sandboxes the preview with exactly allow-scripts allow-modals allow-forms', () => {
    const { iframe } = renderFrame();

    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-modals allow-forms');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('renders the document with srcdoc and no referrer', () => {
    const { iframe, iframeRef } = renderFrame();

    expect(iframe.getAttribute('srcdoc')).toBe('<p>Hello</p>');
    expect(iframe).not.toHaveAttribute('src');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframeRef.current).toBe(iframe);
  });
});
