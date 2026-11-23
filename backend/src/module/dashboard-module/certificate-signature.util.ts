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

function normalizePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('BEGIN PRIVATE KEY')) return trimmed;
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
    if (decoded.includes('BEGIN PRIVATE KEY')) return decoded;
  } catch {
    // Fall through to the original value; createPrivateKey will report the error.
  }
  return trimmed;
}

export function getCertificateSigningPrivateKey(): KeyObject {
  if (cachedPrivateKey !== undefined) {
    if (cachedPrivateKey === null) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Certificate signing is not configured.');
    }
    return cachedPrivateKey;
  }

  const raw = env.CERTIFICATE_SIGNING_PRIVATE_KEY;
  if (!raw) {
    cachedPrivateKey = null;
    throw new AppError(500, 'INTERNAL_ERROR', 'Certificate signing is not configured.');
  }

  try {
    cachedPrivateKey = createPrivateKey(normalizePrivateKey(raw));
  } catch {
    cachedPrivateKey = null;
    throw new AppError(500, 'INTERNAL_ERROR', 'Certificate signing is not configured.');
  }

  cachedPublicKey = undefined;
  return cachedPrivateKey;
}

export function getCertificateSigningPublicKey(): KeyObject {
  if (cachedPublicKey !== undefined) {
    if (cachedPublicKey === null) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Certificate signing is not configured.');
    }
    return cachedPublicKey;
  }

  try {
    cachedPublicKey = createPublicKey(getCertificateSigningPrivateKey());
  } catch {
    cachedPublicKey = null;
    throw new AppError(500, 'INTERNAL_ERROR', 'Certificate signing is not configured.');
  }

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
