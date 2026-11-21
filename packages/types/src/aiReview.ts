export type AiDecision = 'approve' | 'rework';

export type ReviewPrompt = {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateReviewPromptRequest = { name: string; content: string };
export type UpdateReviewPromptRequest = Partial<CreateReviewPromptRequest>;

export type AnalyzeTasksRequest = {
  traineeId: string;
  taskIds: string[];
  promptId: string;
};

export type AiTaskResult =
  | {
      taskId: string;
      status: 'ok';
      recommendation: AiDecision;
      reasoning: string;
      feedback: string;
      evidence: string[];
      provider: string;
      model: string;
    }
  | { taskId: string; status: 'error'; error: string };

export type AnalyzeTasksResponse = { results: AiTaskResult[] };
