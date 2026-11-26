import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CheckpointFileInput,
  CheckpointWorkspaceFile,
  SaveCheckpointAnswerRequest,
  TraineeCheckpointAnswer,
} from '@itp/types';
import { saveCheckpointAnswer } from '../../api/checkpoints';
import { ApiError } from '../../api/errors';

export type AnswerSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type DraftAnswer = {
  questionId: string;
  answerText: string;
  selectedOption: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  /** Base64 payload waiting to be sent. Cleared once the server confirms it. */
  fileBase64: string | null;
  clearFile: boolean;
  /** Practical questions only: the latest workspace snapshot. */
  files: CheckpointWorkspaceFile[] | null;
  /** Practical questions only: true when every file was deleted after a save. */
  clearFiles: boolean;
  /** Monotonic revision used by the server's compare-and-set check. */
  revision: number;
  confirmedRevision: number;
  dirty: boolean;
  status: AnswerSaveStatus;
  savedAt: string | null;
  error: string | null;
};

export type AnswerSaveSummary = {
  dirtyCount: number;
  savingCount: number;
  errorCount: number;
  lastSavedAt: string | null;
};

type UseCheckpointAutosaveOptions = {
  attemptId: string;
  initialAnswers: TraineeCheckpointAnswer[];
  /** Editing is disabled at the deadline, so no more writes may be sent. */
  locked: boolean;
  onFinalized: () => void;
};

type UseCheckpointAutosaveResult = {
  answers: Record<string, DraftAnswer>;
  summary: AnswerSaveSummary;
  updateText: (questionId: string, text: string) => void;
  selectOption: (questionId: string, option: string) => void;
  attachFile: (questionId: string, file: CheckpointFileInput) => void;
  removeFile: (questionId: string) => void;
  updateFiles: (questionId: string, files: CheckpointWorkspaceFile[]) => void;
  flushQuestion: (questionId: string) => Promise<boolean>;
  flushAll: () => Promise<boolean>;
  retryAll: () => void;
  retryQuestion: (questionId: string) => void;
};

type Timers = {
  debounce?: ReturnType<typeof setTimeout>;
  maxWait?: ReturnType<typeof setTimeout>;
  retry?: ReturnType<typeof setTimeout>;
};

const DEBOUNCE_MS = 1200;
const MAX_WAIT_MS = 5000;
const RETRY_MS = 4000;

function toDraft(answer: TraineeCheckpointAnswer): DraftAnswer {
  const revision = Math.max(answer.clientRevision, 0);
  const hasContent =
    Boolean(answer.answerText && answer.answerText.length > 0) ||
    Boolean(answer.selectedOption) ||
    Boolean(answer.fileName) ||
    Boolean(answer.files && answer.files.length > 0);

  return {
    questionId: answer.questionId,
    answerText: answer.answerText ?? '',
    selectedOption: answer.selectedOption,
    fileName: answer.fileName,
    fileMimeType: answer.fileMimeType,
    fileSize: answer.fileSize,
    fileBase64: null,
    clearFile: false,
    files: answer.files,
    clearFiles: false,
    revision,
    confirmedRevision: revision,
    dirty: false,
    status: answer.savedAt && hasContent ? 'saved' : 'idle',
    savedAt: answer.savedAt,
    error: null,
  };
}

function createDrafts(answers: TraineeCheckpointAnswer[]): Record<string, DraftAnswer> {
  const drafts: Record<string, DraftAnswer> = {};
  for (const answer of answers) drafts[answer.questionId] = toDraft(answer);
  return drafts;
}

function isFinalizedError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.code === 'CHECKPOINT_ATTEMPT_FINALIZED' ||
    error.code === 'CHECKPOINT_EXPIRED' ||
    error.code === 'CHECKPOINT_NOT_AVAILABLE'
  );
}

/**
 * Debounced, revision-based autosave for a checkpoint attempt.
 *
 * The server owns the revision counter: every save sends a strictly higher
 * number and the database only applies the write when it is newer. A "saved"
 * label is only shown after the server confirms the write.
 */
export function useCheckpointAutosave({
  attemptId,
  initialAnswers,
  locked,
  onFinalized,
}: UseCheckpointAutosaveOptions): UseCheckpointAutosaveResult {
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>(() =>
    createDrafts(initialAnswers)
  );
  const draftsRef = useRef<Record<string, DraftAnswer>>(answers);

  const timersRef = useRef<Record<string, Timers>>({});
  const inFlightRef = useRef<Record<string, Promise<boolean> | undefined>>({});
  const lockedRef = useRef(locked);
  const onFinalizedRef = useRef(onFinalized);
  const runSaveRef = useRef<(questionId: string) => Promise<boolean>>(() => Promise.resolve(true));

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    onFinalizedRef.current = onFinalized;
  }, [onFinalized]);

  const commit = useCallback((next: Record<string, DraftAnswer>) => {
    draftsRef.current = next;
    setAnswers(next);
  }, []);

  const patch = useCallback(
    (questionId: string, changes: Partial<DraftAnswer>) => {
      const current = draftsRef.current[questionId];
      if (!current) return;
      commit({ ...draftsRef.current, [questionId]: { ...current, ...changes } });
    },
    [commit]
  );

  const clearTimers = useCallback((questionId: string, keys?: Array<keyof Timers>) => {
    const timers = timersRef.current[questionId];
    if (!timers) return;
    const toClear = keys ?? (['debounce', 'maxWait', 'retry'] as Array<keyof Timers>);
    for (const key of toClear) {
      const handle = timers[key];
      if (handle) clearTimeout(handle);
      timers[key] = undefined;
    }
  }, []);

  const scheduleRetry = useCallback((questionId: string) => {
    const timers = (timersRef.current[questionId] ??= {});
    if (timers.retry) clearTimeout(timers.retry);
    timers.retry = setTimeout(() => {
      timers.retry = undefined;
      void runSaveRef.current(questionId);
    }, RETRY_MS);
  }, []);

  const scheduleSave = useCallback((questionId: string) => {
    const timers = (timersRef.current[questionId] ??= {});
    if (timers.debounce) clearTimeout(timers.debounce);
    if (timers.retry) {
      clearTimeout(timers.retry);
      timers.retry = undefined;
    }

    timers.debounce = setTimeout(() => {
      timers.debounce = undefined;
      void runSaveRef.current(questionId);
    }, DEBOUNCE_MS);

    if (!timers.maxWait) {
      timers.maxWait = setTimeout(() => {
        timers.maxWait = undefined;
        void runSaveRef.current(questionId);
      }, MAX_WAIT_MS);
    }
  }, []);

  const runSave = useCallback(
    async (questionId: string): Promise<boolean> => {
      clearTimers(questionId, ['debounce', 'maxWait']);

      const existing = inFlightRef.current[questionId];
      if (existing) return existing;

      const first = draftsRef.current[questionId];
      if (!first || !first.dirty || lockedRef.current) return true;

      const promise = (async () => {
        // A user can keep typing while a request is in flight. The loop sends a
        // follow-up revision so the last keystroke always reaches the server.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const draft = draftsRef.current[questionId];
          if (!draft || !draft.dirty || lockedRef.current) return true;

          const sendingRevision = draft.revision;
          const payload: SaveCheckpointAnswerRequest = {
            clientRevision: sendingRevision,
            answerText: draft.answerText,
            selectedOption: draft.selectedOption,
          };

          if (draft.fileBase64) {
            payload.file = {
              name: draft.fileName ?? 'answer-file',
              mimeType: draft.fileMimeType ?? 'application/octet-stream',
              size: draft.fileSize ?? 0,
              dataBase64: draft.fileBase64,
            };
          } else if (draft.clearFile) {
            payload.clearFile = true;
          }

          if (draft.files !== null) {
            payload.files = draft.files;
          } else if (draft.clearFiles) {
            payload.clearFiles = true;
          }

          patch(questionId, { status: 'saving', error: null });

          try {
            const response = await saveCheckpointAnswer(attemptId, questionId, payload);
            const after = draftsRef.current[questionId];
            if (!after) return true;

            const changedDuringSave = after.revision > sendingRevision;
            const stillDirty = response.stale || changedDuringSave;

            patch(questionId, {
              confirmedRevision: Math.max(after.confirmedRevision, response.clientRevision),
              revision: response.stale
                ? Math.max(after.revision, response.clientRevision + 1)
                : after.revision,
              dirty: stillDirty,
              status: stillDirty ? 'dirty' : 'saved',
              savedAt: response.savedAt,
              error: null,
              fileBase64: null,
              clearFile: false,
              clearFiles: false,
            });

            if (!stillDirty) return true;
          } catch (error) {
            const apiError = error instanceof ApiError ? error : null;
            patch(questionId, {
              status: 'error',
              error: apiError?.message ?? 'Could not save this answer.',
            });
            if (isFinalizedError(error)) {
              onFinalizedRef.current();
              return false;
            }
            scheduleRetry(questionId);
            return false;
          }
        }

        const after = draftsRef.current[questionId];
        if (after?.dirty && !lockedRef.current) scheduleSave(questionId);
        return true;
      })().finally(() => {
        inFlightRef.current[questionId] = undefined;
      });

      inFlightRef.current[questionId] = promise;
      return promise;
    },
    [attemptId, clearTimers, patch, scheduleRetry, scheduleSave]
  );

  useEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);

  const changeDraft = useCallback(
    (questionId: string, changes: Partial<DraftAnswer>) => {
      if (lockedRef.current) return;
      const current = draftsRef.current[questionId];
      if (!current) return;
      patch(questionId, {
        ...changes,
        revision: Math.max(current.revision, current.confirmedRevision) + 1,
        dirty: true,
        status: 'dirty',
        error: null,
      });
      scheduleSave(questionId);
    },
    [patch, scheduleSave]
  );

  const updateText = useCallback(
    (questionId: string, text: string) => {
      changeDraft(questionId, { answerText: text });
    },
    [changeDraft]
  );

  const selectOption = useCallback(
    (questionId: string, option: string) => {
      changeDraft(questionId, { selectedOption: option });
    },
    [changeDraft]
  );

  const attachFile = useCallback(
    (questionId: string, file: CheckpointFileInput) => {
      changeDraft(questionId, {
        fileName: file.name,
        fileMimeType: file.mimeType,
        fileSize: file.size,
        fileBase64: file.dataBase64,
        clearFile: false,
      });
    },
    [changeDraft]
  );

  const removeFile = useCallback(
    (questionId: string) => {
      changeDraft(questionId, {
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        fileBase64: null,
        clearFile: true,
      });
    },
    [changeDraft]
  );

  const updateFiles = useCallback(
    (questionId: string, files: CheckpointWorkspaceFile[]) => {
      changeDraft(questionId, { files, clearFiles: false });
    },
    [changeDraft]
  );

  const flushQuestion = useCallback(
    async (questionId: string): Promise<boolean> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        clearTimers(questionId, ['debounce', 'maxWait', 'retry']);
        const existing = inFlightRef.current[questionId];
        if (existing) await existing;
        const ok = await runSaveRef.current(questionId);
        if (!ok) return false;
        if (!draftsRef.current[questionId]?.dirty) return true;
      }
      return !draftsRef.current[questionId]?.dirty;
    },
    [clearTimers]
  );

  const flushAll = useCallback(async (): Promise<boolean> => {
    const dirtyIds = Object.values(draftsRef.current)
      .filter((draft) => draft.dirty)
      .map((draft) => draft.questionId);
    for (const questionId of dirtyIds) {
      clearTimers(questionId, ['debounce', 'maxWait', 'retry']);
    }

    const results = await Promise.all(
      dirtyIds.map(async (questionId) => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const ok = await runSaveRef.current(questionId);
          if (!ok) return false;
          if (!draftsRef.current[questionId]?.dirty) return true;
        }
        return !draftsRef.current[questionId]?.dirty;
      })
    );
    return results.every(Boolean);
  }, [clearTimers]);

  const retryQuestion = useCallback(
    (questionId: string) => {
      clearTimers(questionId, ['retry']);
      void runSaveRef.current(questionId);
    },
    [clearTimers]
  );

  const retryAll = useCallback(() => {
    for (const draft of Object.values(draftsRef.current)) {
      if (draft.status === 'error') retryQuestion(draft.questionId);
    }
  }, [retryQuestion]);

  // Saving after the tab is hidden catches the case where the trainee closes
  // the window without pressing submit.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden' && !lockedRef.current) {
        void flushAll();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [flushAll]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const entry of Object.values(timers)) {
        if (entry.debounce) clearTimeout(entry.debounce);
        if (entry.maxWait) clearTimeout(entry.maxWait);
        if (entry.retry) clearTimeout(entry.retry);
      }
    };
  }, []);

  const summary: AnswerSaveSummary = {
    dirtyCount: Object.values(answers).filter((answer) => answer.dirty).length,
    savingCount: Object.values(answers).filter((answer) => answer.status === 'saving').length,
    errorCount: Object.values(answers).filter((answer) => answer.status === 'error').length,
    lastSavedAt:
      Object.values(answers)
        .map((answer) => answer.savedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
  };

  return {
    answers,
    summary,
    updateText,
    selectOption,
    attachFile,
    removeFile,
    updateFiles,
    flushQuestion,
    flushAll,
    retryAll,
    retryQuestion,
  };
}
