# Certificate Security

Vinkup certificates are verifiable credentials. A downloaded PDF can be edited, so authenticity is determined by the issued certificate record in the database and by an Ed25519 digital signature over protected certificate fields.

## Issuance workflow

1. A trainee requests `GET /api/courses/:courseId/certificate`.
2. The backend authenticates the trainee and uses the trainee ID from the auth token. It never trusts a trainee ID from the client.
3. The backend checks eligibility:
   - every curriculum day in the course is completed;
   - every required (non-stretch) task has `review_status=approved`.
4. If eligible, the backend issues or returns a persisted certificate record. Issuance is idempotent for the same trainee/course.
5. The certificate is signed with the backend Ed25519 private key and stored in PostgreSQL.

## Certificate ID generation

Certificate IDs are generated with `crypto.randomBytes(10)` and formatted as `VK-` followed by 20 uppercase hex characters. IDs are not derived from trainee/course IDs. The database enforces uniqueness on `certificate_id` and on `(trainee_id, course_id)`.

## Database persistence

Prisma model: `certificate`

| Field | Purpose |
| --- | --- |
| `id` | Internal UUID |
| `certificate_id` | Public verification ID |
| `trainee_id`, `course_id` | Ownership and course reference |
| `trainee_name`, `course_title` | Snapshot at issuance time |
| `days_completed`, `completed_at` | Completion snapshot |
| `issued_at` | Issuance timestamp |
| `status` | `ACTIVE` or `REVOKED` |
| `revoked_at` | Revocation timestamp |
| `signature` | Base64 Ed25519 signature |
| `signature_algorithm`, `signature_version` | Signature metadata |

Migration:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

## Digital signature

Algorithm: **Ed25519** (`signature_algorithm=Ed25519`, `signature_version=v1`).

Canonical payload (JSON, fixed field order):

```json
{
  "certificateId": "VK-...",
  "traineeName": "...",
  "courseTitle": "...",
  "completedAt": "2026-11-20T00:00:00.000Z",
  "issuedAt": "2026-11-21T00:00:00.000Z"
}
```

The payload is UTF-8 encoded and signed with the backend private key. Verification reconstructs the same payload from the database record and verifies the signature with the corresponding public key.

## Key management

Environment variable:

- `CERTIFICATE_SIGNING_PRIVATE_KEY` - Ed25519 PKCS8 PEM, or base64-encoded PKCS8 PEM.

Generate a key locally:

```bash
node -e "const {generateKeyPairSync}=require('crypto'); const {privateKey,publicKey}=generateKeyPairSync('ed25519'); console.log('PRIVATE_KEY_BASE64=' + privateKey.export({type:'pkcs8',format:'pem'}).toString('base64')); console.log(publicKey.export({type:'spki',format:'pem'}));"
```

Rules:

- Keep the private key only in backend environment/secret manager configuration.
- Never expose it to frontend, Electron renderer/preload, or PDFs.
- Never commit private keys.
- If signing configuration is missing, issuance fails safely with an internal error.
- For key rotation, issue new certificates with the new key and keep verification support for old algorithm/version/key IDs as a follow-up. Existing records retain their signature metadata for audit.

## Verification API

Public endpoint (no trainee authentication):

```http
GET /api/certificates/verify/:certificateId
```

Response:

```json
{
  "valid": true,
  "signatureValid": true,
  "status": "ACTIVE",
  "certificateId": "VK-EXAMPLE",
  "traineeName": "Example Trainee",
  "courseTitle": "HTML and CSS",
  "completedAt": "2026-11-20T00:00:00.000Z",
  "issuedAt": "2026-11-21T00:00:00.000Z",
  "message": "Certificate is valid."
}
```

Verification checks:

1. Certificate record exists.
2. Signature verifies over canonical payload from DB record.
3. Status is `ACTIVE`.

The endpoint returns clear results for unknown, invalid-signature, revoked, and valid certificates. It does not expose trainee email, internal IDs, or auth data. Basic rate limiting is applied.

## Revocation

Authorized staff endpoint:

```http
POST /api/certificates/:certificateId/revoke
```

- Requires active mentor or manager authentication.
- Sets status to `REVOKED` and stores `revoked_at`.
- Keeps original certificate data and signature for audit.
- Revoked certificates are never reported as valid.

## PDF integration

The Electron certificate PDF still uses the existing print/PDF flow. The certificate sheet displays:

- certificate ID;
- issued date;
- protected certificate fields;
- digital signature and signature metadata.

The private signing key is never included in the PDF.

## Local testing

```bash
# backend
cd backend
npm test -- src/module/dashboard-module/certificate.service.test.ts
npm run typecheck

# frontend
cd frontend
npm test -- src/pages/CertificatePage/CertificatePage.test.tsx src/pages/CertificateVerificationPage/CertificateVerificationPage.test.tsx
npx tsc -b --noEmit
```

For API tests, configure `backend/.env.test` with `TEST_DATABASE_URL` and `CERTIFICATE_SIGNING_PRIVATE_KEY`, then run:

```bash
cd backend
npm run test:api -- src/test/api/certificat.api.test.ts
```
