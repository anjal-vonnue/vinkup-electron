import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceFilesReporter } from './useWorkspaceFilesReporter';

const initialFiles = [{ path: 'index.ts', content: 'console.log("start");' }];

type Props = {
  files: Record<string, string>;
  onChange: (files: { path: string; content: string }[]) => void;
};

function renderReporter(props: Props) {
  return renderHook(
    ({ files, onChange }: Props) => useWorkspaceFilesReporter(files, initialFiles, onChange),
    { initialProps: props }
  );
}

describe('useWorkspaceFilesReporter', () => {
  it('does not treat opening the starter files as an answer', () => {
    const onChange = vi.fn();
    renderReporter({ files: { 'index.ts': 'console.log("start");' }, onChange });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports an edit once and ignores later renders with the same files', () => {
    const onChange = vi.fn();
    const nextOnChange = vi.fn();
    const edited = { 'index.ts': 'console.log("done");' };
    const { rerender } = renderReporter({
      files: { 'index.ts': 'console.log("start");' },
      onChange,
    });

    rerender({ files: edited, onChange });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([{ path: 'index.ts', content: 'console.log("done");' }]);

    // A new callback identity on every parent render must not look like a new edit.
    rerender({ files: edited, onChange: nextOnChange });
    rerender({ files: edited, onChange });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(nextOnChange).not.toHaveBeenCalled();
  });

  it('reports a later edit using the latest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderReporter({
      files: { 'index.ts': 'console.log("start");' },
      onChange: first,
    });

    rerender({ files: { 'index.ts': 'console.log("done");' }, onChange: second });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith([{ path: 'index.ts', content: 'console.log("done");' }]);
  });
});
