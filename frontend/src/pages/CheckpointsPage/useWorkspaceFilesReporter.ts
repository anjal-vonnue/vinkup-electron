import { useEffect, useRef } from 'react';
import type { CheckpointWorkspaceFile } from '@itp/types';
import { workspaceFilesFromRecord, workspaceFilesSignature } from './practicalWorkspaceFiles';

/**
 * Reports each distinct workspace snapshot to the autosave at most once.
 *
 * Opening the starter files is not an answer by itself, so the initial snapshot is
 * never reported. The callback is kept in a ref because callers commonly pass an
 * inline arrow: without it every parent render would look like a new snapshot and
 * could start an endless save loop.
 */
export function useWorkspaceFilesReporter(
  files: Record<string, string>,
  initialFiles: CheckpointWorkspaceFile[],
  onFilesChange: (files: CheckpointWorkspaceFile[]) => void
): void {
  const lastSignatureRef = useRef(workspaceFilesSignature(initialFiles));
  const onFilesChangeRef = useRef(onFilesChange);

  useEffect(() => {
    onFilesChangeRef.current = onFilesChange;
  }, [onFilesChange]);

  useEffect(() => {
    const next = workspaceFilesFromRecord(files);
    const signature = workspaceFilesSignature(next);
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    onFilesChangeRef.current(next);
  }, [files]);
}
