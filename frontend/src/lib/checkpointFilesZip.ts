import type { ManagerCheckpointAttemptDetail } from '@itp/types';
import { safeZipName } from './adminTaskZip';

export type CheckpointFilesZipTask = {
  path: string;
  files: Array<{ path: string; content: string }>;
  instructionsMarkdown: string;
  sequenceOrder: number;
  title: string;
};

/**
 * Groups submitted practical answers into one ZIP folder per trainee, named
 * after the trainee. Each folder also receives the checkpoint's INSTRUCTIONS.md.
 * Attempts without submitted workspace files are skipped.
 */
export function buildCheckpointFilesZipTasks(
  checkpointTitle: string,
  instructionsMarkdown: string,
  attempts: ManagerCheckpointAttemptDetail[]
): CheckpointFilesZipTask[] {
  const root = safeZipName(checkpointTitle);
  const usedFolders = new Set<string>();
  const tasks: CheckpointFilesZipTask[] = [];

  for (const attempt of attempts) {
    const practicalAnswers = attempt.questions
      .filter((question) => question.type === 'PRACTICAL')
      .map((question) => ({
        question,
        files: attempt.answers.find((answer) => answer.questionId === question.id)?.files ?? [],
      }))
      .filter((entry) => entry.files.length > 0);

    if (practicalAnswers.length === 0) continue;

    let folder = safeZipName(attempt.traineeName);
    if (attempt.attemptNumber > 1) folder += ` (Attempt ${attempt.attemptNumber})`;
    if (usedFolders.has(folder.toLowerCase())) {
      folder += ` (${safeZipName(attempt.traineeEmail)})`;
    }
    usedFolders.add(folder.toLowerCase());

    // Only split by question when the checkpoint has more than one practical
    // question, so single-question papers keep a flat trainee folder.
    const nestByQuestion = practicalAnswers.length > 1;
    const files = practicalAnswers.flatMap(({ question, files: answerFiles }) =>
      answerFiles.map((file) => ({
        path: nestByQuestion
          ? `Question ${question.orderIndex} - ${question.title}/${file.path}`
          : file.path,
        content: file.content,
      }))
    );

    tasks.push({
      path: `${root}/${folder}`,
      files,
      instructionsMarkdown,
      sequenceOrder: attempt.attemptNumber,
      title: attempt.traineeName,
    });
  }

  return tasks;
}
