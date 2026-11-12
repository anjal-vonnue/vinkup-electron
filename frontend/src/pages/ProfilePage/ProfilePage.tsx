import { useEffect, useState } from 'react';
import { getProfile } from '../../api/profile';
import { getTypingStats } from '../../api/typingTest';
import { type ProfileData, type TypingStats } from '@itp/types';
import ProfileHeader from '../../components/ProfileHeader';
import StatsSummary from '../../components/StatsSummary';
import ActivityHeatmap from '../../components/ActivityHeatmap';
import DailyActivityTable from '../../components/DailyActivityTable';
import styles from './ProfilePage.module.css';
import Header from '../../components/Header';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import HelpButton from '../../components/HelpButton';
import { HEATMAP_DAYS } from '../../lib/activityHeatmap';
import { useActivityHistory } from './hooks/useActivityHistory';
import CertificateList from '../../components/CertificateList';
import { useEarnedCertificates } from '../../hooks/useEarnedCerificates';

export default function ProfilePage() {
  const certificates = useEarnedCertificates();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [typingStats, setTypingStats] = useState<TypingStats | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Loaded beside the profile; a failure here only affects the heatmap.
  const activity = useActivityHistory(HEATMAP_DAYS);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const [profileData, statsData] = await Promise.all([getProfile(), getTypingStats()]);

        if (isMounted) {
          setProfile(profileData);
          setTypingStats(statsData);
        }
      } catch (error) {
        if (isMounted) {
          setError(error instanceof Error ? error : new Error('Something went wrong'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [attempt]);

  const handleRetry = () => {
    setIsLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  };

  if (isLoading) {
    return (
      <main className={styles.page}>
        <Header />
        <LoaderOverlay />
      </main>
    );
  }

  if (!profile || !typingStats) {
    return (
      <>
        <Header />
        <main className={styles.page}>
          <ErrorState
            fullPage
            message={`${error?.message ?? 'Something went wrong'}. Please try again.`}
            title="Unable to load profile"
            onRetry={handleRetry}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className={styles.page}>
        <ProfileHeader trainee={profile.trainee} />

        <section className={styles.card}>
          <StatsSummary total={profile.total} typingStats={typingStats} />

          <div className={styles.heatmapSlot}>
            {activity.isLoading && (
              <div
                className={styles.heatmapSkeleton}
                aria-busy="true"
                aria-label="Loading activity history"
              />
            )}

            {activity.error && (
              <ErrorState
                title="Couldn't load activity history"
                message={activity.error.message}
                onRetry={activity.retry}
              />
            )}

            {activity.days && <ActivityHeatmap days={activity.days} />}
          </div>

          <DailyActivityTable days={profile.dailyActivity} />
        </section>

        <CertificateList certificates={certificates} />
      </main>

      <HelpButton />
    </>
  );
}
