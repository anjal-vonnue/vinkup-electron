import type {
  CheckpointAttemptTime,
  CheckpointGroup,
  CheckpointMarkdownPreview,
  CheckpointResult,
  CreateCheckpointGroupRequest,
  CreateCheckpointRequest,
  GradeCheckpointAttemptRequest,
  ManagerCheckpointAttemptDetail,
  ManagerCheckpointAttemptSummary,
  ManagerCheckpointDetail,
  ManagerCheckpointSummary,
  SaveCheckpointAnswerRequest,
  SaveCheckpointAnswerResponse,
  SubmitCheckpointAttemptResponse,
  TraineeCheckpointAttempt,
  TraineeCheckpointDetail,
  TraineeCheckpointSummary,
  UpdateCheckpointRequest,
} from '@itp/types';
import { apiClient } from './client';

// ---------- Manager ----------

export async function previewCheckpointMarkdown(
  markdown: string
): Promise<CheckpointMarkdownPreview> {
  const res = await apiClient.post<CheckpointMarkdownPreview>('/manager/checkpoints/preview', {
    markdown,
  });
  return res.data;
}

export async function getManagerCheckpoints(): Promise<ManagerCheckpointSummary[]> {
  const res = await apiClient.get<ManagerCheckpointSummary[]>('/manager/checkpoints');
  return res.data;
}

export async function getManagerCheckpoint(checkpointId: string): Promise<ManagerCheckpointDetail> {
  const res = await apiClient.get<ManagerCheckpointDetail>(`/manager/checkpoints/${checkpointId}`);
  return res.data;
}

export async function createManagerCheckpoint(
  body: CreateCheckpointRequest
): Promise<ManagerCheckpointDetail> {
  const res = await apiClient.post<ManagerCheckpointDetail>('/manager/checkpoints', body);
  return res.data;
}

export async function updateManagerCheckpoint(
  checkpointId: string,
  body: UpdateCheckpointRequest
): Promise<ManagerCheckpointDetail> {
  const res = await apiClient.patch<ManagerCheckpointDetail>(
    `/manager/checkpoints/${checkpointId}`,
    body
  );
  return res.data;
}

export async function publishManagerCheckpoint(
  checkpointId: string
): Promise<ManagerCheckpointDetail> {
  const res = await apiClient.post<ManagerCheckpointDetail>(
    `/manager/checkpoints/${checkpointId}/publish`
  );
  return res.data;
}

export async function cancelManagerCheckpoint(
  checkpointId: string
): Promise<ManagerCheckpointDetail> {
  const res = await apiClient.post<ManagerCheckpointDetail>(
    `/manager/checkpoints/${checkpointId}/cancel`
  );
  return res.data;
}

export async function publishManagerCheckpointResults(
  checkpointId: string
): Promise<ManagerCheckpointDetail> {
  const res = await apiClient.post<ManagerCheckpointDetail>(
    `/manager/checkpoints/${checkpointId}/publish-results`
  );
  return res.data;
}

export async function getManagerCheckpointAttempts(
  checkpointId: string
): Promise<ManagerCheckpointAttemptSummary[]> {
  const res = await apiClient.get<ManagerCheckpointAttemptSummary[]>(
    `/manager/checkpoints/${checkpointId}/attempts`
  );
  return res.data;
}

export async function getManagerCheckpointAttempt(
  attemptId: string
): Promise<ManagerCheckpointAttemptDetail> {
  const res = await apiClient.get<ManagerCheckpointAttemptDetail>(
    `/manager/checkpoints/attempts/${attemptId}`
  );
  return res.data;
}

export async function gradeManagerCheckpointAttempt(
  attemptId: string,
  body: GradeCheckpointAttemptRequest
): Promise<ManagerCheckpointAttemptDetail> {
  const res = await apiClient.post<ManagerCheckpointAttemptDetail>(
    `/manager/checkpoints/attempts/${attemptId}/grade`,
    body
  );
  return res.data;
}

export async function downloadCheckpointAnswerFile(
  attemptId: string,
  questionId: string
): Promise<{ blob: Blob; fileName: string }> {
  const res = await apiClient.get<Blob>(
    `/manager/checkpoints/attempts/${attemptId}/answers/${questionId}/file`,
    { responseType: 'blob' }
  );

  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="([^"]+)"/);
  return { blob: res.data, fileName: match?.[1] ?? 'deliverable' };
}

export async function getCheckpointGroups(): Promise<CheckpointGroup[]> {
  const res = await apiClient.get<CheckpointGroup[]>('/manager/checkpoint-groups');
  return res.data;
}

export async function createCheckpointGroup(
  body: CreateCheckpointGroupRequest
): Promise<CheckpointGroup> {
  const res = await apiClient.post<CheckpointGroup>('/manager/checkpoint-groups', body);
  return res.data;
}

export async function updateCheckpointGroup(
  groupId: string,
  body: CreateCheckpointGroupRequest
): Promise<CheckpointGroup> {
  const res = await apiClient.patch<CheckpointGroup>(`/manager/checkpoint-groups/${groupId}`, body);
  return res.data;
}

export async function deleteCheckpointGroup(groupId: string): Promise<void> {
  await apiClient.delete(`/manager/checkpoint-groups/${groupId}`);
}

// ---------- Trainee ----------

export async function getMyCheckpoints(): Promise<TraineeCheckpointSummary[]> {
  const res = await apiClient.get<TraineeCheckpointSummary[]>('/checkpoints');
  return res.data;
}

export async function getMyCheckpoint(checkpointId: string): Promise<TraineeCheckpointDetail> {
  const res = await apiClient.get<TraineeCheckpointDetail>(`/checkpoints/${checkpointId}`);
  return res.data;
}

export async function startCheckpoint(checkpointId: string): Promise<TraineeCheckpointAttempt> {
  const res = await apiClient.post<TraineeCheckpointAttempt>(`/checkpoints/${checkpointId}/start`);
  return res.data;
}

export async function getActiveCheckpointAttempt(): Promise<TraineeCheckpointAttempt | null> {
  const res = await apiClient.get<TraineeCheckpointAttempt | null>('/checkpoints/attempts/active');
  return res.data;
}

export async function getCheckpointAttempt(attemptId: string): Promise<TraineeCheckpointAttempt> {
  const res = await apiClient.get<TraineeCheckpointAttempt>(`/checkpoints/attempts/${attemptId}`);
  return res.data;
}

export async function saveCheckpointAnswer(
  attemptId: string,
  questionId: string,
  body: SaveCheckpointAnswerRequest
): Promise<SaveCheckpointAnswerResponse> {
  const res = await apiClient.put<SaveCheckpointAnswerResponse>(
    `/checkpoints/attempts/${attemptId}/answers/${questionId}`,
    body
  );
  return res.data;
}

export async function submitCheckpointAttempt(
  attemptId: string
): Promise<SubmitCheckpointAttemptResponse> {
  const res = await apiClient.post<SubmitCheckpointAttemptResponse>(
    `/checkpoints/attempts/${attemptId}/submit`
  );
  return res.data;
}

export async function getCheckpointAttemptTime(attemptId: string): Promise<CheckpointAttemptTime> {
  const res = await apiClient.get<CheckpointAttemptTime>(`/checkpoints/attempts/${attemptId}/time`);
  return res.data;
}

export async function getCheckpointResult(attemptId: string): Promise<CheckpointResult> {
  const res = await apiClient.get<CheckpointResult>(`/checkpoints/attempts/${attemptId}/result`);
  return res.data;
}
