import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TaskFile } from '@itp/types';
import SubmissionBrowser from './SubmissionBrowser';

vi.mock('../ReadOnlyCodeViewer', () => ({
  default: ({ files }: { files: TaskFile[] }) => (
    <div aria-label={`${files[0]?.path} code viewer`}>{files[0]?.content}</div>
  ),
}));

const files: TaskFile[] = [
  { path: 'src/index.ts', content: 'export const greeting = "hello";' },
  { path: 'src/utils/format.ts', content: 'export function format() {}' },
  { path: 'README.md', content: '# Submitted readme' },
];

function renderBrowser(instructionsMarkdown = '# Task instructions') {
  return render(
    <SubmissionBrowser
      files={files}
      instructionsMarkdown={instructionsMarkdown}
      scope="trainee-1/task-1"
    />
  );
}

describe('SubmissionBrowser', () => {
  it('shows instructions by default', () => {
    renderBrowser();

    expect(screen.getByRole('button', { name: 'INSTRUCTIONS.md' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByRole('tab', { name: /INSTRUCTIONS\.md/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('heading', { name: 'Task instructions' })).toBeInTheDocument();
  });

  it('shows only the selected file in the code viewer', async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.click(screen.getByRole('treeitem', { name: /index\.ts/ }));

    expect(await screen.findByLabelText('src/index.ts code viewer')).toHaveTextContent(
      'export const greeting'
    );
  });

  it('opens multiple files in tabs and switches content when a tab is selected', async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.click(screen.getByRole('treeitem', { name: /index\.ts/ }));
    await screen.findByLabelText('src/index.ts code viewer');
    await user.click(screen.getByRole('treeitem', { name: /format\.ts/ }));

    expect(await screen.findByLabelText('src/utils/format.ts code viewer')).toHaveTextContent(
      'export function format'
    );
    expect(screen.getAllByRole('tab')).toHaveLength(3);

    await user.click(screen.getByRole('tab', { name: /index\.ts/ }));

    expect(await screen.findByLabelText('src/index.ts code viewer')).toHaveTextContent(
      'export const greeting'
    );
  });

  it('returns to instructions when INSTRUCTIONS.md is selected', async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.click(screen.getByRole('treeitem', { name: /README\.md/ }));
    expect(await screen.findByLabelText('README.md code viewer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'INSTRUCTIONS.md' }));

    expect(screen.getByRole('heading', { name: 'Task instructions' })).toBeInTheDocument();
    expect(screen.queryByLabelText('README.md code viewer')).not.toBeInTheDocument();
  });

  it('shows a message when instructions are empty', () => {
    renderBrowser(' \n ');

    expect(screen.getByText('No instructions for this task.')).toBeInTheDocument();
  });

  it('activates the right neighbour when the active file tab is closed', async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.click(screen.getByRole('treeitem', { name: /index\.ts/ }));
    await user.click(screen.getByRole('treeitem', { name: /format\.ts/ }));
    await screen.findByLabelText('src/utils/format.ts code viewer');
    await user.click(screen.getByRole('tab', { name: /index\.ts/ }));
    await user.click(screen.getByRole('button', { name: 'Close index.ts' }));

    expect(await screen.findByLabelText('src/utils/format.ts code viewer')).toBeInTheDocument();
  });

  it('shows an empty state when all tabs are closed', async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.click(screen.getByRole('button', { name: 'Tab options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Close all tabs' }));

    expect(screen.getByText('Select a file to view')).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('opens a real root INSTRUCTIONS.md separately from the task instructions tab', async () => {
    const user = userEvent.setup();
    const filesWithInstructionsName: TaskFile[] = [
      ...files,
      { path: 'INSTRUCTIONS.md', content: '# Submitted file, not task instructions' },
    ];
    render(
      <SubmissionBrowser
        files={filesWithInstructionsName}
        instructionsMarkdown="# Task instructions"
        scope="trainee-1/task-1"
      />
    );

    await user.click(screen.getByRole('treeitem', { name: /^INSTRUCTIONS\.md$/ }));

    expect(screen.getAllByRole('tab', { name: /INSTRUCTIONS\.md/ })).toHaveLength(2);
    expect(await screen.findByLabelText('INSTRUCTIONS.md code viewer')).toHaveTextContent(
      'Submitted file, not task instructions'
    );
  });

  it('collapses and expands folders', () => {
    renderBrowser();

    const srcFolder = screen.getByRole('treeitem', { name: /src/ });
    expect(screen.getByRole('treeitem', { name: /index\.ts/ })).toBeInTheDocument();

    fireEvent.click(srcFolder);
    expect(screen.queryByRole('treeitem', { name: /index\.ts/ })).not.toBeInTheDocument();

    fireEvent.click(srcFolder);
    expect(screen.getByRole('treeitem', { name: /index\.ts/ })).toBeInTheDocument();
  });
});
