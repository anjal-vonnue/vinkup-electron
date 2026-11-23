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
