import { describe, expect, it } from 'vitest';
import type {
  CheckpointQuestion,
  CheckpointWorkspaceFile,
  ManagerCheckpointAnswer,
  ManagerCheckpointAttemptDetail,
} from '@itp/types';
import { buildCheckpointFilesZipTasks } from './checkpointFilesZip';

function question(
  id: string,
  orderIndex: number,
  type: CheckpointQuestion['type']
): CheckpointQuestion {
  return {
    id,
    orderIndex,
    title: `Question ${orderIndex}`,
    promptMarkdown: `Prompt ${orderIndex}`,
    type,
    marks: 10,
    options: null,
    correctOption: null,
    codeLanguage: null,
    runtime: type === 'PRACTICAL' ? 'sql' : null,
    runCommand: null,
    setupSql: null,
    starterFiles: null,
  };
}

function answer(
  questionId: string,
  files: CheckpointWorkspaceFile[] | null
): ManagerCheckpointAnswer {
  return {
    questionId,
    answerText: null,
    selectedOption: null,
    fileName: null,
    fileMimeType: null,
    fileSize: null,
    files,
    awardedMarks: null,
    feedback: null,
    savedAt: null,
  };
}

function attempt(
  overrides: Partial<ManagerCheckpointAttemptDetail> = {}
): ManagerCheckpointAttemptDetail {
  return {
    id: 'attempt-1',
    traineeId: 'trainee-1',
    traineeName: 'Asha Rao',
    traineeEmail: 'asha@example.com',
    attemptNumber: 1,
    status: 'SUBMITTED',
    startedAt: '2026-11-24T08:00:00.000Z',
    deadlineAt: '2026-11-24T09:00:00.000Z',
    submittedAt: '2026-11-24T08:45:00.000Z',
    submissionReason: 'MANUAL',
    totalScore: null,
    percentage: null,
    passed: null,
    gradedAt: null,
    resultVisible: false,
    checkpointId: 'checkpoint-1',
    checkpointTitle: 'Checkpoint',
    checkpointTotalMarks: 20,
    feedback: null,
    gradedByName: null,
    questions: [question('q1', 1, 'PRACTICAL')],
    answers: [answer('q1', [{ path: 'answer.sql', content: 'select 1;' }])],
    events: [],
    ...overrides,
  };
}

describe('buildCheckpointFilesZipTasks', () => {
  it('creates one folder per trainee containing their files and INSTRUCTIONS.md', () => {
    const tasks = buildCheckpointFilesZipTasks('SQL checkpoint', 'Read the paper.', [attempt()]);

    expect(tasks).toEqual([
      {
        path: 'SQL checkpoint/Asha Rao',
        files: [{ path: 'answer.sql', content: 'select 1;' }],
        instructionsMarkdown: 'Read the paper.',
        sequenceOrder: 1,
        title: 'Asha Rao',
      },
    ]);
  });

  it('skips attempts without submitted practical files', () => {
    const tasks = buildCheckpointFilesZipTasks('SQL checkpoint', 'Read the paper.', [
      attempt({ id: 'attempt-1', answers: [answer('q1', null)] }),
      attempt({
        id: 'attempt-2',
        traineeName: 'Linus Pauling',
        traineeEmail: 'linus@example.com',
        answers: [answer('q1', [])],
      }),
    ]);

    expect(tasks).toEqual([]);
  });

  it('nests files by question when a checkpoint has several practical questions', () => {
    const tasks = buildCheckpointFilesZipTasks('Mixed checkpoint', 'Read the paper.', [
      attempt({
        questions: [
          question('q1', 1, 'PRACTICAL'),
          question('q2', 2, 'LONG_TEXT'),
          question('q3', 3, 'PRACTICAL'),
        ],
        answers: [
          answer('q1', [{ path: 'app.js', content: 'console.log(1);' }]),
          answer('q2', null),
          answer('q3', [{ path: 'answer.sql', content: 'select 1;' }]),
        ],
      }),
    ]);

    expect(tasks[0].files).toEqual([
      { path: 'Question 1 - Question 1/app.js', content: 'console.log(1);' },
      { path: 'Question 3 - Question 3/answer.sql', content: 'select 1;' },
    ]);
  });

  it('disambiguates repeated attempts and duplicate trainee names', () => {
    const tasks = buildCheckpointFilesZipTasks('SQL checkpoint', 'Read the paper.', [
      attempt(),
      attempt({ id: 'attempt-2', attemptNumber: 2 }),
      attempt({
        id: 'attempt-3',
        traineeName: 'Asha Rao',
        traineeEmail: 'asha.rao@example.com',
        answers: [answer('q1', [{ path: 'answer.sql', content: 'select 2;' }])],
      }),
    ]);

    expect(tasks.map((task) => task.path)).toEqual([
      'SQL checkpoint/Asha Rao',
      'SQL checkpoint/Asha Rao (Attempt 2)',
      'SQL checkpoint/Asha Rao (asha.rao@example.com)',
    ]);
  });
});
