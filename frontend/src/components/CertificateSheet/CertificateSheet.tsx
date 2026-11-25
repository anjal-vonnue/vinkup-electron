import type { CourseCertificate } from '@itp/types';
import Logo from '../../assets/logo-mark-currentColor.svg?react';
import Vinkup from '../../assets/icon.png';
import { formatCertificateDate, formatHours } from '../../lib/certificate';
import styles from './CertificateSheet.module.css';

function Corner({ className }: { className: string }) {
  return (
    <svg className={`${styles.corner} ${className}`} viewBox="0 0 60 60" aria-hidden="true">
      <path d="M2 58 V2 H58" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M10 58 V10 H58" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <circle cx="2" cy="2" r="4" fill="currentColor" />
      <path d="M18 18 L30 18 M18 18 L18 30" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

export default function CertificateSheet({ certificate }: { certificate: CourseCertificate }) {
  return (
    <section className={styles.sheet} aria-label="Certificate of completion">
      <div className={styles.frame}>
        <Corner className={styles.cornerTl} />
        <Corner className={styles.cornerTr} />
        <Corner className={styles.cornerBl} />
        <Corner className={styles.cornerBr} />

        <Logo className={styles.watermark} aria-hidden="true" />

        <header className={styles.header}>
          <img src={Vinkup} className={styles.logo} alt="Vinkup" />
          {/* <p className={styles.kicker}>Vinkup</p> */}
          <h1 className={styles.title}>Certificate of completion</h1>
        </header>

        <main className={styles.main}>
          <p className={styles.lead}>This certifies that</p>
          <p className={styles.name}>{certificate.traineeName}</p>
          <p className={styles.lead}>has successfully completed the course in</p>
          <p className={styles.course}>{certificate.courseTitle}</p>
          <p className={styles.description}>
            a <span>{certificate.daysCompleted}-day</span> training programme, with a total learning
            time of <span>{formatHours(certificate.timeSpentSeconds)}</span>.
          </p>
        </main>

        <footer className={styles.footer}>
          <p className={styles.id}>Certificate ID {certificate.certificateId}</p>
          <p className={styles.footerNote}>
            Issued {formatCertificateDate(certificate.completedAt)} · Vinkup · In-House Trainee
            Training Platform
          </p>
        </footer>
      </div>
    </section>
  );
}
