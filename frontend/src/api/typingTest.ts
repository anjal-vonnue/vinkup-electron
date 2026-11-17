import type { SaveTypingResultRequest, TypingResultRecord, TypingStats } from '@itp/types';
import { apiClient } from './client';

export async function getTypingResults(): Promise<TypingResultRecord[]> {
  const res = await apiClient.get<TypingResultRecord[]>('/typing-test/results');
  return res.data;
}

export async function saveTypingResult(body: SaveTypingResultRequest): Promise<TypingResultRecord> {
  const res = await apiClient.post<TypingResultRecord>('/typing-test/results', body);
  return res.data;
}

export async function getTypingStats(): Promise<TypingStats> {
  const res = await apiClient.get<TypingStats>('/typing-test/stats');
  return res.data;
}
