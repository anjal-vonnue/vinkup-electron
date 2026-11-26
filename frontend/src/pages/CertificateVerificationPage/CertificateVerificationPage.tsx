import { useState } from 'react';
import { Search, ShieldCheck, ShieldX, ShieldAlert } from 'lucide-react';
import type { CertificateVerificationResponse } from '@itp/types';
import AdminHeader from '../../components/AdminHeader';
import Header from '../../components/Header';
import { verifyCertificate } from '../../api/certificate';
import { ApiError } from '../../api/errors';
import { useAuth } from '../../context/Useauth';
import { formatCertificateDate } from '../../lib/certificate';
import { MANAGER_NAV } from '../../constants/managerNav';
import styles from './CertificateVerificationPage.module.css';

function statusLabel(result: CertificateVerificationResponse): string {
  if (result.valid) return 'Authentic certificate';
  if (result.status === 'REVOKED') return 'Revoked certificate';
  if (result.status === 'UNKNOWN') return 'Certificate not found';
  if (!result.signatureValid) return 'Invalid certificate signature';
  return 'Invalid certificate';
}

function StatusIcon({ result }: { result: CertificateVerificationResponse }) {
  if (result.valid) return <ShieldCheck size={28} aria-hidden="true" />;
  if (result.status === 'REVOKED' || !result.signatureValid) {
    return <ShieldAlert size={28} aria-hidden="true" />;
  }
  return <ShieldX size={28} aria-hidden="true" />;
}

export default function CertificateVerificationPage() {
  const { user } = useAuth();
  const [certificateId, setCertificateId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CertificateVerificationResponse | null>(null);
  const [resultRevision, setResultRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = certificateId.trim().toUpperCase();
    if (!trimmed) {
      setError('Enter a certificate ID.');
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await verifyCertificate(trimmed);
      setResult(response);
      setResultRevision((revision) => revision + 1);
    } catch (err) {
      setResult(null);
      if (err instanceof ApiError) {
        setError(err.message || 'Unable to verify the certificate. Please try again.');
      } else {
        setError('Unable to verify the certificate. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const header =
    user?.role === 'manager' ? (
      <AdminHeader
        homePath="/manager"
        badge="Manager view"
        navItems={MANAGER_NAV}
        navLabel="Manager navigation"
      />
    ) : user?.role === 'mentor' ? (
      <AdminHeader />
    ) : (
      <Header />
    );

  return (
    <>
      {header}
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="verify-certificate-title">
          <p className={styles.kicker}>Certificate verification</p>
          <h1 id="verify-certificate-title" className={styles.title}>
            Verify a Vinkup certificate
          </h1>
          <p className={styles.description}>
            Enter the certificate ID printed on the certificate. We check the digital signature and
            the issued certificate record.
          </p>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <label className={styles.label} htmlFor="certificate-id">
              Certificate ID
            </label>
            <div className={styles.controls}>
              <input
                id="certificate-id"
                className={styles.input}
                type="text"
                value={certificateId}
                onChange={(event) => setCertificateId(event.target.value)}
                placeholder="VK-..."
                autoComplete="off"
                spellCheck={false}
              />
              <button className={styles.button} type="submit" disabled={isLoading}>
                <Search size={16} aria-hidden="true" />
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </form>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div
            className={`${styles.resultReveal} ${result ? styles.resultRevealVisible : ''}`}
            aria-hidden={!result}
            aria-live="polite"
          >
            <div className={styles.resultRevealInner}>
              {result && (
                <section
                  key={resultRevision}
                  className={`${styles.result} ${result.valid ? styles.valid : styles.invalid}`}
                >
                  <div className={styles.resultHeader}>
                    <StatusIcon result={result} />
                    <div>
                      <h2 className={styles.resultTitle}>{statusLabel(result)}</h2>
                      <p className={styles.resultMessage}>{result.message}</p>
                    </div>
                  </div>

                  <dl className={styles.details}>
                    <div>
                      <dt>Certificate ID</dt>
                      <dd>{result.certificateId}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{result.status}</dd>
                    </div>
                    <div>
                      <dt>Signature</dt>
                      <dd>{result.signatureValid ? 'Valid' : 'Invalid'}</dd>
                    </div>
                    <div>
                      <dt>Trainee</dt>
                      <dd>{result.traineeName ?? 'Unavailable'}</dd>
                    </div>
                    <div>
                      <dt>Course</dt>
                      <dd>{result.courseTitle ?? 'Unavailable'}</dd>
                    </div>
                    <div>
                      <dt>Completed</dt>
                      <dd>
                        {result.completedAt
                          ? formatCertificateDate(result.completedAt)
                          : 'Unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>Issued</dt>
                      <dd>
                        {result.issuedAt ? formatCertificateDate(result.issuedAt) : 'Unavailable'}
                      </dd>
                    </div>
                  </dl>
                </section>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
