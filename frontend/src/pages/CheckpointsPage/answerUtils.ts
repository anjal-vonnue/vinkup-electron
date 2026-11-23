import type { CheckpointFileInput, CheckpointQuestion } from '@itp/types';
import type { DraftAnswer } from './useCheckpointAutosave';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Reads a deliverable into the base64 payload the API accepts. */
export function readDeliverableFile(file: File): Promise<CheckpointFileInput> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error('The file must be 2 MB or smaller.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result;
      if (!base64) {
        reject(new Error('The file is empty.'));
        return;
      }
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataBase64: base64,
      });
    };
    reader.readAsDataURL(file);
  });
}

export function isAnswerProvided(
  question: CheckpointQuestion,
  draft: DraftAnswer | undefined
): boolean {
  if (!draft) return false;
  if (question.type === 'MULTIPLE_CHOICE') return Boolean(draft.selectedOption);
  if (question.type === 'FILE') return Boolean(draft.fileName);
  return draft.answerText.trim().length > 0;
}
