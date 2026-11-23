import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildFileTree } from '../../lib/buildFileTree';
import FileTree from './FileTree';

const nodes = buildFileTree(['src/a.js', 'src/utils/b.js', 'c.js']);

function renderTree(overrides: Partial<ComponentProps<typeof FileTree>> = {}) {
  const onOpenFile = vi.fn();
  const onToggleFolder = vi.fn();
  const onDelete = vi.fn();

  render(
    <FileTree
      nodes={nodes}
      activePath={null}
      dirtyPaths={new Set()}
      expandedFolders={new Set()}
      onOpenFile={onOpenFile}
      onToggleFolder={onToggleFolder}
      onDelete={onDelete}
      {...overrides}
    />
  );

  return { onOpenFile, onToggleFolder, onDelete };
}

describe('FileTree', () => {
  it('renders the fixture tree: folder before file, collapsed by default', () => {
    renderTree();
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('c.js')).toBeInTheDocument();
    expect(screen.queryByText('a.js')).not.toBeInTheDocument();
  });

  it('opens a file on click', async () => {
    const user = userEvent.setup();
    const { onOpenFile } = renderTree();

    await user.click(screen.getByText('c.js'));
    expect(onOpenFile).toHaveBeenCalledWith('c.js');
  });

  it('toggles a folder on click', async () => {
    const user = userEvent.setup();
    const { onToggleFolder } = renderTree();

    await user.click(screen.getByText('src'));
    expect(onToggleFolder).toHaveBeenCalledWith('src');
  });

  it('supports Down/Right/Left/Enter keyboard navigation', () => {
    const { onToggleFolder, onOpenFile } = renderTree({ expandedFolders: new Set(['src']) });

    const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
    srcRow.focus();

    fireEvent.keyDown(srcRow, { key: 'ArrowDown' });
    const utilsRow = screen.getByText('utils').closest('[role="treeitem"]') as HTMLElement;
    expect(utilsRow).toHaveFocus();

    fireEvent.keyDown(utilsRow, { key: 'ArrowRight' });
    expect(onToggleFolder).toHaveBeenCalledWith('src/utils');

    fireEvent.keyDown(utilsRow, { key: 'ArrowLeft' });
    const focusedAfterLeft = document.activeElement;
    expect(focusedAfterLeft?.getAttribute('data-path')).toBe('src');

    fireEvent.keyDown(srcRow, { key: 'Enter' });
    expect(onToggleFolder).toHaveBeenCalledWith('src');

    const cRow = screen.getByText('c.js').closest('[role="treeitem"]') as HTMLElement;
    cRow.focus();
    fireEvent.keyDown(cRow, { key: 'Enter' });
    expect(onOpenFile).toHaveBeenCalledWith('c.js');
  });

  it('shows the dirty dot with its accessible label', () => {
    renderTree({ dirtyPaths: new Set(['c.js']) });
    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument();
  });

  it('calls onDelete on the Delete key', () => {
    const { onDelete } = renderTree();

    const cRow = screen.getByText('c.js').closest('[role="treeitem"]') as HTMLElement;
    cRow.focus();
    fireEvent.keyDown(cRow, { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledWith({ type: 'file', name: 'c.js', path: 'c.js' });
  });

  it('does not render delete controls or handle Delete when onDelete is omitted', () => {
    renderTree({ onDelete: undefined, dirtyPaths: undefined });

    const cRow = screen.getByText('c.js').closest('[role="treeitem"]') as HTMLElement;
    cRow.focus();
    const deleteEvent = new KeyboardEvent('keydown', {
      key: 'Delete',
      bubbles: true,
      cancelable: true,
    });
    cRow.dispatchEvent(deleteEvent);

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(deleteEvent.defaultPrevented).toBe(false);
  });
});
