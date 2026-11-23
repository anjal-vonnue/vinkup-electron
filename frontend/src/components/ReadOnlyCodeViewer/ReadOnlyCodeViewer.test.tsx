import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TaskFile } from '@itp/types';
import ReadOnlyCodeViewer from './ReadOnlyCodeViewer';

const files: TaskFile[] = [
  { path: 'index.ts', content: 'export const value = 1;' },
  { path: 'style.css', content: '.app { color: red; }' },
];

describe('ReadOnlyCodeViewer', () => {
  it('renders file tabs by default', () => {
    render(<ReadOnlyCodeViewer files={files} scope="trainee-1/task-1" />);

    expect(screen.getByRole('tablist', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('omits file tabs when hideTabs is true', () => {
    render(<ReadOnlyCodeViewer files={[files[0]]} scope="trainee-1/task-1" hideTabs />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByLabelText('index.ts (read-only)')).toBeInTheDocument();
  });
});
