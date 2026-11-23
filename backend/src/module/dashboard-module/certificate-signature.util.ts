import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';

export const CERTIFICATE_SIGNATURE_ALGORITHM = 'Ed25519';
export const CERTIFICATE_SIGNATURE_VERSION = 'v1';

export type CertificatePayload = {
  certificateId: string;
  traineeName: string;
  courseTitle: string;
  completedAt: string;
  issuedAt: string;
};

let cachedPrivateKey: KeyObject | null | undefined;
let cachedPublicKey: KeyObject | null | undefined;

function parseCertificatePrivateKey(raw: string): KeyObject {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
  if (trimmed.includes('BEGIN PRIVATE KEY')) {
    return createPrivateKey(trimmed);
  }

  const buffer = Buffer.from(trimmed, 'base64');
  const decoded = buffer.toString('utf8').trim();
  if (decoded.includes('BEGIN PRIVATE KEY')) {
    return createPrivateKey(decoded);
  }

  return createPrivateKey({ key: buffer, format: 'der', type: 'pkcs8' });
}

export function getCertificateSigningPrivateKey(): KeyObject {
  if (cachedPrivateKey) return cachedPrivateKey;

  const raw = env.CERTIFICATE_SIGNING_PRIVATE_KEY ?? process.env.CERTIFICATE_SIGNING_PRIVATE_KEY;
  if (!raw) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Certificate signing is not configured.');
  }

  try {
    cachedPrivateKey = parseCertificatePrivateKey(raw);
  } catch (error) {
    cachedPrivateKey = undefined;
    cachedPublicKey = undefined;
    console.error('Invalid CERTIFICATE_SIGNING_PRIVATE_KEY configuration.', error);
    throw new AppError(500, 'INTERNAL_ERROR', 'Certificate signing key is invalid.');
  }

  cachedPublicKey = undefined;
  return cachedPrivateKey;
}

export function getCertificateSigningPublicKey(): KeyObject {
  if (cachedPublicKey) return cachedPublicKey;
  cachedPublicKey = createPublicKey(getCertificateSigningPrivateKey());
  return cachedPublicKey;
}

export function resetCertificateSigningKeysForTests(): void {
  cachedPrivateKey = undefined;
  cachedPublicKey = undefined;
}

/**
 * Canonical representation of the protected certificate fields. Field order is
 * fixed so signing and verification always use the same bytes.
 */
export function canonicalCertificatePayload(payload: CertificatePayload): string {
  return JSON.stringify({
    certificateId: payload.certificateId,
    traineeName: payload.traineeName,
    courseTitle: payload.courseTitle,
    completedAt: payload.completedAt,
    issuedAt: payload.issuedAt,
  });
}

export function signCertificatePayload(payload: CertificatePayload): string {
  const key = getCertificateSigningPrivateKey();
  const data = Buffer.from(canonicalCertificatePayload(payload), 'utf8');
  return sign(null, data, key).toString('base64');
}

export function verifyCertificatePayload(payload: CertificatePayload, signature: string): boolean {
  let publicKey: KeyObject;
  try {
    publicKey = getCertificateSigningPublicKey();
  } catch {
    return false;
  }

  try {
    const data = Buffer.from(canonicalCertificatePayload(payload), 'utf8');
    const signatureBuffer = Buffer.from(signature, 'base64');
    if (signatureBuffer.length === 0) return false;
    return verify(null, data, publicKey, signatureBuffer);
  } catch {
    return false;
  }
}
