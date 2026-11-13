import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import Header from '../../components/Header';
import CertificateSheet from '../../components/CertificateSheet';
import StateMessage from '../../components/StateMessage';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import { CURRICULUM_COURSES } from '../../constants/courses';
import { useCertificate } from '../../hooks/useCertificate';
import { useLandscapePageStyle } from '../../hooks/useLandscapePageStyle';
import { usePrintMode } from '../../hooks/usePrintMode';
import { certificateDocumentTitle } from '../../lib/certificate';
import styles from './CertificatePage.module.css';

export default function CertificatePage() {
  const { courseId = '' } = useParams();
  const { isLoading, certificate, error, retry } = useCertificate(courseId);
  const [printError, setPrintError] = useState<string | null>(null);

  useLandscapePageStyle();
  // Light theme + "Vinkup certificate – CSS – Asha Rao" as the PDF file name while printing.
  const { print } = usePrintMode<null>({
    defaults: null,
    documentTitle: certificate
      ? certificateDocumentTitle(certificate.courseTitle, certificate.traineeName)
      : 'Vinkup certificate',
    desktopPrintException: true,
  });

  const handlePrint = (): void => {
    setPrintError(null);
    void print(null).catch((printFailure: unknown) => {
      console.error('[certificate] Failed to open the print dialog', printFailure);
      setPrintError('Unable to open certificate printing. Please try again.');
    });
  };

  if (isLoading) return <LoaderOverlay fullPage label="Loading certificate…" />;

  const courseLabel = CURRICULUM_COURSES.find((c) => c.id === courseId)?.label;

  if (error || !certificate) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          {error?.status === 403 ? (
            <StateMessage
              icon="🎓"
              title={`Finish every day of ${courseLabel ?? 'this course'} to get this certificate`}
              description="Your certificate unlocks as soon as you complete the last day."
              actionLabel="Back to Dashboard"
              actionHref="/"
            />
          ) : error?.status === 404 ? (
            <StateMessage
              icon="🔍"
              title="Course not found"
              description="We couldn't find the course for this certificate."
              actionLabel="Back to Dashboard"
              actionHref="/"
            />
          ) : (
            <ErrorState
              title="Unable to load the certificate"
              message={error?.message ?? 'Something went wrong. Please try again.'}
              onRetry={retry}
            />
          )}
        </main>
      </>
    );
  }

  return (
    <>
      {/* Hidden when printing: only the sheet is printed. */}
      <div className={styles.screenOnly}>
        <Header />
      </div>

      <main className={styles.page}>
        <div className={`${styles.toolbar} ${styles.screenOnly}`}>
          <Link to="/" className={styles.back}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to Dashboard
          </Link>
          <button type="button" className={styles.printButton} onClick={handlePrint}>
            <Printer size={16} aria-hidden="true" />
            Print / Save as PDF
          </button>
        </div>
        {printError && (
          <p className={`${styles.printError} ${styles.screenOnly}`} role="alert">
            {printError}
          </p>
        )}

        <CertificateSheet certificate={certificate} />
      </main>
    </>
  );
}
