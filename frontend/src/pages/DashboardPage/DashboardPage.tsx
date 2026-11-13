import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { DashboardResponse, DaySummary } from '@itp/types';
import { getDashboard } from '../../api/dashboard';
import { getCourseDays } from '../../api/courses';
import { CURRICULUM_COURSES } from '../../constants/courses';
import Header from '../../components/Header';
import CurrentLessonCard from '../../components/CurrentLessonCard';
import TrackTabs from '../../components/TrackTabs';
import ScheduleGrid from '../../components/ScheduleGrid';
import StatsRow from '../../components/StatsRow';
import LoaderOverlay from '../../components/Common/LoadingState';
import { ErrorState } from '../../components/Common/ErrorState';
import GreetingBanner from '../../components/GreetingBanner';
import { useAuth } from '../../context/Useauth';
import { useGreeting } from '../../hooks/useGreeting';
import styles from './DashboardPage.module.css';
import HelpButton from '../../components/HelpButton';

const DEFAULT_COURSE_ID = 'html';

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const copy = { ...record };
  delete copy[key];
  return copy;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isVisible: isGreetingVisible } = useGreeting();
  const traineeFirstName = user?.name?.trim().split(/\s+/)[0] || null;

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);

  // Days of each course, loaded the first time its tab is opened
  const [daysByCourse, setDaysByCourse] = useState<Record<string, DaySummary[]>>({});
  const [daysErrors, setDaysErrors] = useState<Record<string, Error>>({});
  const requestedCourses = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void getDashboard()
      .then(async (data) => {
        const courseId = data.nextDay?.courseId ?? DEFAULT_COURSE_ID;
        // This effect owns the first request, so the effect below must not repeat it
        requestedCourses.current.add(courseId);
        let firstDays: DaySummary[] | null = null;
        let firstDaysError: Error | null = null;
        try {
          firstDays = await getCourseDays(courseId);
        } catch (err: unknown) {
          firstDaysError = err instanceof Error ? err : new Error('Something went wrong');
        }
        return { data, courseId, firstDays, firstDaysError };
      })
      .then(({ data, courseId, firstDays, firstDaysError }) => {
        if (cancelled) return;
        if (firstDays) setDaysByCourse((prev) => ({ ...prev, [courseId]: firstDays }));
        if (firstDaysError) setDaysErrors((prev) => ({ ...prev, [courseId]: firstDaysError }));
        setDashboard(data);
        setActiveCourseId(data.nextDay?.courseId ?? DEFAULT_COURSE_ID);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error('Something went wrong'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true; // ignore the response if the page unmounts or retries
    };
  }, [attempt]);

  // Loads one course's days. A failed load is forgotten, so opening the tab again or
  // pressing "Try again" asks the server again.
  const loadCourseDays = useCallback((courseId: string) => {
    requestedCourses.current.add(courseId);

    getCourseDays(courseId)
      .then((days) => {
        setDaysByCourse((prev) => ({ ...prev, [courseId]: days }));
        setDaysErrors((prev) => withoutKey(prev, courseId));
      })
      .catch((err: unknown) => {
        requestedCourses.current.delete(courseId);
        setDaysErrors((prev) => ({
          ...prev,
          [courseId]: err instanceof Error ? err : new Error('Something went wrong'),
        }));
      });
  }, []);

  useEffect(() => {
    if (!activeCourseId || requestedCourses.current.has(activeCourseId)) return;
    loadCourseDays(activeCourseId);
  }, [activeCourseId, loadCourseDays]);

  // Both run from a click, so setting state here is fine.
  const handleRetryDays = (courseId: string) => {
    setDaysErrors((prev) => withoutKey(prev, courseId));
    loadCourseDays(courseId);
  };

  // A tab whose load failed is loaded again from here, not by the effect: clicking the tab
  // that is already open doesn't change activeCourseId, so the effect wouldn't run.
  const handleSelectCourse = (courseId: string) => {
    setActiveCourseId(courseId);
    if (daysErrors[courseId]) handleRetryDays(courseId);
  };

  // Runs from a click, so setting state here is fine
  const handleRetry = () => {
    setIsLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  };

  if (isLoading) {
    return (
      <>
        <Header />
        <div className={styles.loadingRegion}>
          <LoaderOverlay />
        </div>
        <HelpButton />
      </>
    );
  }
  if (error) {
    return (
      <ErrorState
        fullPage
        title="Unable to load the dashboard"
        message={error.message}
        onRetry={handleRetry}
      />
    );
  }

  if (!dashboard) return null;

  const activeTrack =
    CURRICULUM_COURSES.find((t) => t.id === activeCourseId) ?? CURRICULUM_COURSES[0];
  const activeDays = daysByCourse[activeTrack.id];
  const daysError = daysErrors[activeTrack.id];

  const displayedDay = dashboard.nextDay;
  const displayedDayTrackLabel =
    CURRICULUM_COURSES.find((t) => t.id === displayedDay?.courseId)?.label ?? '';
  const completionPercent =
    dashboard.totalDaysOverall > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((dashboard.totalDaysCompleteOverall / dashboard.totalDaysOverall) * 100)
          )
        )
      : 0;

  // Locked days are ignored. The backend still returns DAY_LOCKED for direct URLs.
  function openDay(day: DaySummary | null | undefined) {
    if (!day || day.status === 'LOCKED') return;
    void navigate(`/days/${day.id}`);
  }

  return (
    <>
      <Header />

      <div className={styles.page}>
        {isGreetingVisible && (
          <GreetingBanner
            name={traineeFirstName}
            completedDays={dashboard.totalDaysCompleteOverall}
            totalDays={dashboard.totalDaysOverall}
            completionPercent={completionPercent}
          />
        )}
        {displayedDay ? (
          <CurrentLessonCard
            courseTitle={displayedDayTrackLabel}
            dayNumber={displayedDay.dayNumber}
            totalDays={displayedDay.courseTotalDays}
            lessonTitle={displayedDay.title}
            description={displayedDay.description}
            onContinue={() => openDay(displayedDay)}
          />
        ) : (
          <p className={styles.status}>You&apos;ve completed every course. Great work!</p>
        )}

        <section className={styles.section}>
          <div className={styles.trackHeader}>
            <p className={styles.sectionLabel}>Curriculum Track</p>
            <p className={styles.overallProgress}>
              {dashboard.totalDaysCompleteOverall} of {dashboard.totalDaysOverall} days complete
              overall
            </p>
          </div>
          <TrackTabs
            tracks={CURRICULUM_COURSES}
            activeTrackId={activeTrack.id}
            onSelect={handleSelectCourse}
            completedTrackIds={dashboard.completedCourseIds}
          />
        </section>

        <section className={styles.section}>
          {activeDays ? (
            <ScheduleGrid
              title={`${activeTrack.label} Module — Schedule`}
              days={activeDays}
              currentDayId={displayedDay?.id ?? null}
              onSelectDay={(dayId) => openDay(activeDays.find((d) => d.id === dayId))}
            />
          ) : daysError ? (
            <ErrorState
              title={`Unable to load the ${activeTrack.label} schedule`}
              message={daysError.message}
              onRetry={() => handleRetryDays(activeTrack.id)}
            />
          ) : (
            <LoaderOverlay label="Loading days..." />
          )}
        </section>

        <div className={styles.divider} />

        <section className={styles.section}>
          <StatsRow
            totalActiveSeconds={dashboard.total.activeSeconds}
            totalCodingSeconds={dashboard.total.codingSeconds}
            latestWpm={dashboard.typing.latest?.wpm ?? null}
          />
        </section>
      </div>
      <HelpButton />
    </>
  );
}
