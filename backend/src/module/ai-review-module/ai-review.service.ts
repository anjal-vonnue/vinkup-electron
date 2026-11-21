import type { ReviewPrompt } from '@itp/types';
import { ConflictError, NotFoundError } from '../../errors/AppError';
import { aiReviewRepository as repo } from './ai-review.repository';
import type { CreatePromptBody, UpdatePromptBody } from './ai-review.schema';

type PromptRow = {
  id: string;
  name: string;
  content: string;
  created_at: Date;
  updated_at: Date;
};

const toDto = (row: PromptRow): ReviewPrompt => ({
  id: row.id,
  name: row.name,
  content: row.content,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const duplicateName = () =>
  new ConflictError('PROMPT_NAME_TAKEN', 'You already have a prompt with this name.');

// Two requests can pass the name pre-check together; the unique index then rejects one.
const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002';

export class AiReviewService {
  listPrompts = async (adminId: string): Promise<ReviewPrompt[]> =>
    (await repo.listPrompts(adminId)).map(toDto);

  createPrompt = async (adminId: string, body: CreatePromptBody): Promise<ReviewPrompt> => {
    if (await repo.findPromptByName(adminId, body.name)) throw duplicateName();
    try {
      return toDto(await repo.createPrompt(adminId, body));
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateName();
      throw error;
    }
  };

  updatePrompt = async (
    adminId: string,
    promptId: string,
    body: UpdatePromptBody
  ): Promise<ReviewPrompt> => {
    await this.assertOwned(adminId, promptId);
    if (body.name && (await repo.findPromptByName(adminId, body.name, promptId))) {
      throw duplicateName();
    }
    try {
      return toDto(await repo.updatePrompt(promptId, body));
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateName();
      throw error;
    }
  };

  deletePrompt = async (adminId: string, promptId: string): Promise<void> => {
    await this.assertOwned(adminId, promptId);
    await repo.deletePrompt(promptId);
  };

  // Someone else's prompt looks the same as a missing one, so ids can't be probed.
  private assertOwned = async (adminId: string, promptId: string) => {
    const prompt = await repo.findPrompt(adminId, promptId);
    if (!prompt) throw new NotFoundError('Prompt not found.');
    return prompt;
  };
}
