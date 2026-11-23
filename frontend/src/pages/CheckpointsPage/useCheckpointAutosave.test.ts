import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TraineeCheckpointAnswer } from '@itp/types';
import { ApiError } from '../../api/errors';

const api = vi.hoisted(() => ({
  saveCheckpointAnswer: vi.fn(),
}));

vi.mock('../../api/checkpoints', () => ({
  saveCheckpointAnswer: api.saveCheckpointAnswer,
}));

import { useCheckpointAutosave } from './useCheckpointAutosave';

const attemptId = 'attempt-1';
const questionId = 'question-1';
const savedAt = '2026-11-23T10:00:00.000Z';

function serverAnswer(overrides: Partial<TraineeCheckpointAnswer> = {}): TraineeCheckpointAnswer {
  return {
    questionId,
    answerText: '',
    selectedOption: null,
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    clientRevision: 0,
    savedAt: null,
    ...overrides,
  };
}

function okResponse(revision: number, stale = false) {
  return {
    questionId,
    clientRevision: revision,
    savedAt,
    stale,
  };
}

function renderAutosave(
  options: {
    answers?: TraineeCheckpointAnswer[];
    locked?: boolean;
    onFinalized?: () => void;
  } = {}
) {
  return renderHook(
    (props: { locked: boolean; answers: TraineeCheckpointAnswer[] }) =>
      useCheckpointAutosave({
        attemptId,
        initialAnswers: props.answers,
        locked: props.locked,
        onFinalized: options.onFinalized ?? (() => {}),
      }),
    {
      initialProps: {
        locked: options.locked ?? false,
        answers: options.answers ?? [serverAnswer()],
      },
    }
  );
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('useCheckpointAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.saveCheckpointAnswer.mockReset();
    api.saveCheckpointAnswer.mockResolvedValue(okResponse(1));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores the saved answer and revision from the server', () => {
    const { result } = renderAutosave({
      answers: [
        serverAnswer({
          answerText: 'restored',
          clientRevision: 3,
          savedAt,
        }),
      ],
    });

    expect(result.current.answers[questionId]).toMatchObject({
      answerText: 'restored',
      revision: 3,
      confirmedRevision: 3,
      dirty: false,
      status: 'saved',
    });
    expect(result.current.summary).toMatchObject({ dirtyCount: 0, errorCount: 0 });
  });

  it('debounces edits and reports saved only after the server confirms', async () => {
    let resolveSave: ((value: ReturnType<typeof okResponse>) => void) | undefined;
    api.saveCheckpointAnswer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    );

    const { result } = renderAutosave();

    act(() => {
      result.current.updateText(questionId, 'draft');
    });

    expect(result.current.answers[questionId]).toMatchObject({
      answerText: 'draft',
      revision: 1,
      dirty: true,
      status: 'dirty',
    });

    await advance(1100);
    expect(api.saveCheckpointAnswer).not.toHaveBeenCalled();

    await advance(100);
    expect(api.saveCheckpointAnswer).toHaveBeenCalledTimes(1);
    expect(api.saveCheckpointAnswer).toHaveBeenCalledWith(
      attemptId,
      questionId,
      expect.objectContaining({ clientRevision: 1, answerText: 'draft' })
    );
    expect(result.current.answers[questionId].status).toBe('saving');

    await act(async () => {
      resolveSave?.(okResponse(1));
      await Promise.resolve();
    });

    expect(result.current.answers[questionId]).toMatchObject({
      status: 'saved',
      dirty: false,
      confirmedRevision: 1,
      savedAt,
    });
  });

  it('sends a follow-up revision when typing continues during a save', async () => {
    let resolveFirst: ((value: ReturnType<typeof okResponse>) => void) | undefined;
    api.saveCheckpointAnswer
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce(okResponse(2));

    const { result } = renderAutosave();

    act(() => {
      result.current.updateText(questionId, 'first');
    });
    await advance(1200);
    expect(api.saveCheckpointAnswer).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.updateText(questionId, 'second');
    });

    await act(async () => {
      resolveFirst?.(okResponse(1));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.saveCheckpointAnswer).toHaveBeenCalledTimes(2);
    expect(api.saveCheckpointAnswer.mock.calls[1][2]).toMatchObject({
      clientRevision: 2,
      answerText: 'second',
    });
    expect(result.current.answers[questionId]).toMatchObject({
      answerText: 'second',
      status: 'saved',
      dirty: false,
    });
  });

  it('keeps a stale response dirty and retries with the newer revision', async () => {
    api.saveCheckpointAnswer
      .mockResolvedValueOnce(okResponse(5, true))
      .mockResolvedValueOnce(okResponse(6));

    const { result } = renderAutosave();

    act(() => {
      result.current.updateText(questionId, 'race');
    });
    await advance(1200);

    expect(api.saveCheckpointAnswer).toHaveBeenCalledTimes(2);
    expect(api.saveCheckpointAnswer.mock.calls[1][2]).toMatchObject({ clientRevision: 6 });
    expect(result.current.answers[questionId]).toMatchObject({
      status: 'saved',
      dirty: false,
      confirmedRevision: 6,
      revision: 6,
    });
  });

  it('shows an error and retries automatically after a failure', async () => {
    api.saveCheckpointAnswer
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Server exploded.'))
      .mockResolvedValueOnce(okResponse(1));

    const { result } = renderAutosave();

    act(() => {
      result.current.updateText(questionId, 'try again');
    });
    await advance(1200);

    expect(result.current.answers[questionId]).toMatchObject({
      status: 'error',
      error: 'Server exploded.',
      dirty: true,
    });

    await advance(4000);

    expect(api.saveCheckpointAnswer).toHaveBeenCalledTimes(2);
    expect(result.current.answers[questionId]).toMatchObject({ status: 'saved', dirty: false });
  });

  it('stops retrying and finalises when the attempt is no longer editable', async () => {
    const onFinalized = vi.fn();
    api.saveCheckpointAnswer.mockRejectedValue(
      new ApiError(409, 'CHECKPOINT_ATTEMPT_FINALIZED', 'Already submitted.')
    );

    const { result } = renderAutosave({ onFinalized });

    act(() => {
      result.current.updateText(questionId, 'late');
    });
    await advance(1200);

    expect(onFinalized).toHaveBeenCalledTimes(1);
    expect(result.current.answers[questionId].status).toBe('error');

    await advance(4000);
    expect(api.saveCheckpointAnswer).toHaveBeenCalledTimes(1);
  });

  it('does not schedule writes once the attempt is locked', async () => {
    const { result } = renderAutosave({ locked: true });

    act(() => {
      result.current.updateText(questionId, 'blocked');
    });
    await advance(2000);

    expect(api.saveCheckpointAnswer).not.toHaveBeenCalled();
    expect(result.current.answers[questionId].answerText).toBe('');
  });

  it('flushes every dirty answer without waiting for the debounce', async () => {
    api.saveCheckpointAnswer.mockImplementation(() => Promise.resolve(okResponse(1)));

    const { result } = renderAutosave({
      answers: [serverAnswer(), serverAnswer({ questionId: 'question-2' })],
    });

    act(() => {
      result.current.updateText(questionId, 'one');
      result.current.updateText('question-2', 'two');
    });

    let flushed = false;
    await act(async () => {
      flushed = await result.current.flushAll();
    });

    expect(flushed).toBe(true);
    expect(api.saveCheckpointAnswer).toHaveBeenCalledTimes(2);
    expect(result.current.summary.dirtyCount).toBe(0);
  });

  it('sends file payloads and can clear an attached file', async () => {
    const { result } = renderAutosave();

    act(() => {
      result.current.attachFile(questionId, {
        name: 'report.pdf',
        mimeType: 'application/pdf',
        size: 12,
        dataBase64: 'ZmFrZQ==',
      });
    });

    await act(async () => {
      await result.current.flushAll();
    });

    expect(api.saveCheckpointAnswer.mock.calls[0][2]).toMatchObject({
      file: {
        name: 'report.pdf',
        mimeType: 'application/pdf',
        size: 12,
        dataBase64: 'ZmFrZQ==',
      },
    });
    expect(result.current.answers[questionId].fileName).toBe('report.pdf');

    act(() => {
      result.current.removeFile(questionId);
    });

    await act(async () => {
      await result.current.flushAll();
    });

    expect(api.saveCheckpointAnswer.mock.calls[1][2]).toMatchObject({ clearFile: true });
    expect(result.current.answers[questionId]).toMatchObject({
      fileName: null,
      clearFile: false,
    });
  });

  it('flushes dirty answers when the tab becomes hidden', async () => {
    const { result } = renderAutosave();

    act(() => {
      result.current.updateText(questionId, 'leaving');
    });

    expect(api.saveCheckpointAnswer).not.toHaveBeenCalled();

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    expect(api.saveCheckpointAnswer).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });
});
