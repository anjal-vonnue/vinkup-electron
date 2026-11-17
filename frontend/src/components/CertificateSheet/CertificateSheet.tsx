import type { CourseCertificate } from '@itp/types';
import Logo from '../../assets/logo-mark-currentColor.svg?react';
import { formatCertificateDate, formatDayCount } from '../../lib/certificate';
import styles from './CertificateSheet.module.css';

export default function CertificateSheet({ certificate }: { certificate: CourseCertificate }) {
  return (
    <section className={styles.sheet} aria-label="Certificate of completion">
      <div className={styles.frame}>
        <Logo className={styles.logo} role="img" aria-label="Vinkup" />
        <p className={styles.kicker}>Vinkup</p>
        <h1 className={styles.title}>Certificate of completion</h1>

        <p className={styles.lead}>This certifies that</p>
        <p className={styles.name}>{certificate.traineeName}</p>
        <p className={styles.lead}>has completed the {certificate.courseTitle} course</p>

        <p className={styles.meta}>
          {formatDayCount(certificate.daysCompleted)} · completed{' '}
          {formatCertificateDate(certificate.completedAt)}
        </p>
        <p className={styles.id}>Certificate ID {certificate.certificateId}</p>

        <p className={styles.footer}>Vinkup · In-House Trainee Training Platform</p>
      </div>
    </section>
  );
}
