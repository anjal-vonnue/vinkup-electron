import type { CertificateVerificationResponse, CourseCertificate } from '@itp/types';
import { apiClient } from './client';

export async function getCertificate(courseId: string): Promise<CourseCertificate> {
  const res = await apiClient.get<CourseCertificate>(`/courses/${courseId}/certificate`);
  return res.data;
}

export async function verifyCertificate(
  certificateId: string
): Promise<CertificateVerificationResponse> {
  const res = await apiClient.get<CertificateVerificationResponse>(
    `/certificates/verify/${encodeURIComponent(certificateId)}`
  );
  return res.data;
}

/** "1h 23m" / "4m 05s" / "12s" */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
