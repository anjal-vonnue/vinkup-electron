import { randomBytes } from 'node:crypto';

export const CERTIFICATE_ID_PREFIX = 'VK-';
export const CERTIFICATE_ID_PATTERN = /^VK-[A-F0-9]{20}$/;

export function generateCertificateId(): string {
  return `${CERTIFICATE_ID_PREFIX}${randomBytes(10).toString('hex').toUpperCase()}`;
}
