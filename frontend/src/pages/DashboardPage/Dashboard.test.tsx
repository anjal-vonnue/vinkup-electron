import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DashboardResponse, DaySummary, DayStatus } from '@itp/types';

import DashboardPage from './DashboardPage';
import { getDashboard } from '../../api/dashboard';
import { getCourseDays } from '../../api/courses';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../../api/dashboard', () => ({
  getDashboard: vi.fn(),
}));

vi.mock('../../api/courses', () => ({
  getCourseDays: vi.fn(),
}));

vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({ user: { name: 'Test Trainee' } }),
}));

vi.mock('../../components/Header', () => ({
  default: () => <header>Header</header>,
}));

vi.mock('../../components/CurrentLessonCard', () => ({
  default: ({
    courseTitle,
    dayNumber,
    totalDays,
    lessonTitle,
    description,
    onContinue,
  }: {
    courseTitle: string;
    dayNumber: number;
    totalDays: number;
    lessonTitle: string;
    description: string;
    onContinue: () => void;
  }) => (
    <div>
      <h2>{lessonTitle}</h2>
      <p>{courseTitle}</p>
      <p>
        Day {dayNumber} of {totalDays}
      </p>
      <p>{description}</p>
      <button onClick={onContinue}>Continue</button>
    </div>
  ),
}));

// changed: also shows the finished courses the page passes down, so tests can check them
vi.mock('../../components/TrackTabs', () => ({
  default: ({
    tracks,
    activeTrackId,
    onSelect,
    completedTrackIds = [],
  }: {
    tracks: { id: string; label: string }[];
    activeTrackId: string;
    onSelect: (id: string) => void;
    completedTrackIds?: string[];
  }) => (
    <>
      <div role="tablist">
        {tracks.map((track) => (
          <button
            key={track.id}
            role="tab"
            aria-selected={track.id === activeTrackId}
            onClick={() => onSelect(track.id)}
          >
            {track.label}
          </button>
        ))}
      </div>
      <p>Certificates: {completedTrackIds.join(', ') || 'none'}</p>
    </>
  ),
}));

// The mock cell is never disabled, so clicks on locked days still reach the page's handler
vi.mock('../../components/ScheduleGrid', () => ({
  default: ({
    title,
    days,
    onSelectDay,
  }: {
    title: string;
    days: { id: string; dayNumber: number; status: string }[];
    onSelectDay: (dayId: string) => void;
  }) => (
    <div>
      <h2>{title}</h2>
      {days.map((day) => (
        <button key={day.id} onClick={() => onSelectDay(day.id)}>
          {String(day.dayNumber).padStart(2, '0')}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../components/StatsRow', () => ({
  default: ({
    totalActiveSeconds,
    totalCodingSeconds,
    latestWpm,
    onTakeTypingTest,
  }: {
    totalActiveSeconds: number;
    totalCodingSeconds: number;
    latestWpm: number | null;
    onTakeTypingTest: () => void;
  }) => (
    <div>
      <p>Total active: {totalActiveSeconds}</p>
      <p>Total coding: {totalCodingSeconds}</p>
      <p>Latest WPM: {latestWpm ?? '—'}</p>
      <button onClick={onTakeTypingTest}>Take a typing test</button>
    </div>
  ),
}));

/* ---------- Test data ---------- */

// Course ids must match CURRICULUM_COURSES in src/constants/courses.ts
function day(
  courseId: string,
  dayNumber: number,
  status: DayStatus,
  extra: Partial<DaySummary> = {}
): DaySummary {
  return {
    id: `${courseId}-day-${String(dayNumber).padStart(2, '0')}`,
    courseId,
    dayNumber,
    title: `${courseId} lesson ${dayNumber}`,
    description: `Description for ${courseId} lesson ${dayNumber}.`,
    status,
    ...extra,
  };
}

const JS_NEXT_DAY = day('js', 6, 'UNLOCKED', {
  title: 'Closures and Higher-Order Functions',
  description:
    'Implement memoized function wrappers and partial application utilities with strict scope isolation.',
});

const jsDays: DaySummary[] = [
  day('js', 1, 'COMPLETED'),
  day('js', 2, 'COMPLETED'),
  day('js', 3, 'COMPLETED'),
  day('js', 4, 'COMPLETED'),
  day('js', 5, 'COMPLETED'),
  JS_NEXT_DAY,
  day('js', 7, 'LOCKED'),
];

const nodeDays: DaySummary[] = [day('node', 1, 'LOCKED'), day('node', 2, 'LOCKED')];

const htmlDays: DaySummary[] = [day('html', 1, 'UNLOCKED'), day('html', 2, 'LOCKED')];

const daysByCourse: Record<string, DaySummary[]> = {
  html: htmlDays,
  js: jsDays,
  node: nodeDays,
};

const mockDashboard: DashboardResponse = {
  nextDay: { ...JS_NEXT_DAY, courseTotalDays: 7 },
  totalDaysCompleteOverall: 17,
  totalDaysOverall: 60,
  today: { activeSeconds: 5400, codingSeconds: 3600 },
  total: { activeSeconds: 153000, codingSeconds: 101700 },
  typing: {
    latest: { wpm: 74, accuracy: 96, takenAt: '2026-09-26T09:00:00Z' },
    todayAverageWpm: 71,
    trend: [
      { date: '2026-09-20', averageWpm: 65 },
      { date: '2026-09-21', averageWpm: 68 },
      { date: '2026-09-22', averageWpm: 70 },
    ],
  },
  completedCourseIds: ['html', 'css'], // new
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.mocked(getCourseDays).mockImplementation((courseId: string) => {
      const days = daysByCourse[courseId];
      return days ? Promise.resolve(days) : Promise.reject(new Error('Course not found.'));
    });
  });

  it('shows the loader while dashboard data is loading and keeps the header visible', () => {
    vi.mocked(getDashboard).mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the error message when dashboard loading fails', async () => {
    vi.mocked(getDashboard).mockRejectedValue(new Error('Failed to load dashboard'));

    renderPage();

    expect(await screen.findByText('Failed to load dashboard')).toBeInTheDocument();
  });

  it('renders the header', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('Header')).toBeInTheDocument();
  });

  it('shows the welcome banner with the trainee first name and curriculum progress', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('Welcome back, Test!')).toBeInTheDocument();
    expect(screen.getByText('17 / 60 days (28%)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Curriculum completion' })).toHaveAttribute(
      'aria-valuenow',
      '28'
    );
  });

  it('renders the next day on the current lesson card', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('Closures and Higher-Order Functions')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Implement memoized function wrappers and partial application utilities with strict scope isolation.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('JavaScript', { selector: 'p' })).toBeInTheDocument();
  });

  it('shows the day number out of the course total sent by the backend', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('Day 6 of 7')).toBeInTheDocument();
  });

  it('renders the overall progress', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('17 of 60 days complete overall')).toBeInTheDocument();
  });

  // new
  it('passes the finished courses to the track tabs for their certificate badges', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('Certificates: html, css')).toBeInTheDocument();
  });

  it("opens the tab of the next day's course and loads only that course's days", async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('JavaScript Module — Schedule')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '01' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '06' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '07' })).toBeInTheDocument();

    expect(getCourseDays).toHaveBeenCalledTimes(1);
    expect(getCourseDays).toHaveBeenCalledWith('js');
  });

  it('keeps the header visible and shows the main content loader until the first course days are loaded', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);
    vi.mocked(getCourseDays).mockReturnValue(new Promise(() => {}));

    renderPage();

    await waitFor(() => {
      expect(getCourseDays).toHaveBeenCalledWith('js');
    });

    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Closures and Higher-Order Functions')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading days...')).not.toBeInTheDocument();
  });

  it('shows "Loading days..." for a tab that is opened later', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();
    await screen.findByText('JavaScript Module — Schedule');

    vi.mocked(getCourseDays).mockReturnValue(new Promise(() => {}));
    await user.click(screen.getByRole('tab', { name: 'Node.js' }));

    expect(await screen.findByText('Loading days...')).toBeInTheDocument();
  });

  it('shows the error message when the days of the course fail to load', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);
    vi.mocked(getCourseDays).mockRejectedValue(new Error('Failed to load days'));

    renderPage();

    expect(await screen.findByText('Failed to load days')).toBeInTheDocument();
  });

  it('offers Try again when the days fail to load, and loads them again', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);
    vi.mocked(getCourseDays).mockRejectedValueOnce(new Error('Failed to load days'));

    renderPage();

    expect(await screen.findByText('Failed to load days')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('JavaScript Module — Schedule')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load days')).not.toBeInTheDocument();
    expect(getCourseDays).toHaveBeenCalledTimes(2);
    expect(getCourseDays).toHaveBeenNthCalledWith(2, 'js');
  });

  it('loads a course again when its tab is reopened after a failed load', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);
    vi.mocked(getCourseDays).mockRejectedValueOnce(new Error('Failed to load days'));

    renderPage();

    expect(await screen.findByText('Failed to load days')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Node.js' }));
    await screen.findByText('Node.js Module — Schedule');
    await user.click(screen.getByRole('tab', { name: 'JavaScript' }));

    expect(await screen.findByText('JavaScript Module — Schedule')).toBeInTheDocument();
    expect(vi.mocked(getCourseDays).mock.calls.filter(([id]) => id === 'js')).toHaveLength(2);
  });

  it('loads a course again when its open tab is clicked after a failed load', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);
    vi.mocked(getCourseDays).mockRejectedValueOnce(new Error('Failed to load days'));

    renderPage();

    expect(await screen.findByText('Failed to load days')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'JavaScript' }));

    expect(await screen.findByText('JavaScript Module — Schedule')).toBeInTheDocument();
    expect(getCourseDays).toHaveBeenCalledTimes(2);
  });

  it('loads the days of another course when its tab is selected', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    await screen.findByText('JavaScript Module — Schedule');

    await user.click(screen.getByRole('tab', { name: 'Node.js' }));

    expect(await screen.findByText('Node.js Module — Schedule')).toBeInTheDocument();
    expect(getCourseDays).toHaveBeenCalledWith('node');
    expect(screen.getByRole('button', { name: '01' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '02' })).toBeInTheDocument();
  });

  it('does not fetch a course again when returning to a tab that was already loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    await screen.findByText('JavaScript Module — Schedule');
    await user.click(screen.getByRole('tab', { name: 'Node.js' }));
    await screen.findByText('Node.js Module — Schedule');
    await user.click(screen.getByRole('tab', { name: 'JavaScript' }));

    expect(await screen.findByText('JavaScript Module — Schedule')).toBeInTheDocument();
    expect(getCourseDays).toHaveBeenCalledTimes(2); // js once, node once
  });

  it('marks the selected track as active', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    await screen.findByText('JavaScript Module — Schedule');

    const javascriptTab = screen.getByRole('tab', { name: 'JavaScript' });
    const nodeTab = screen.getByRole('tab', { name: 'Node.js' });

    expect(javascriptTab).toHaveAttribute('aria-selected', 'true');
    expect(nodeTab).toHaveAttribute('aria-selected', 'false');

    await user.click(nodeTab);

    expect(javascriptTab).toHaveAttribute('aria-selected', 'false');
    expect(nodeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the current lesson card on the next day when switching tracks', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('Closures and Higher-Order Functions')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Node.js' }));
    await screen.findByText('Node.js Module — Schedule');

    expect(screen.getByText('Closures and Higher-Order Functions')).toBeInTheDocument();
  });

  it('renders the statistics data', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByText('Total active: 153000')).toBeInTheDocument();
    expect(screen.getByText('Total coding: 101700')).toBeInTheDocument();
    expect(screen.getByText('Latest WPM: 74')).toBeInTheDocument();
  });

  it('renders the typing test button', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    expect(await screen.findByRole('button', { name: /take a typing test/i })).toBeInTheDocument();
  });

  it('calls getDashboard once when the page loads', async () => {
    vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

    renderPage();

    await screen.findByText('JavaScript Module — Schedule');

    expect(getDashboard).toHaveBeenCalledTimes(1);
  });

  describe('navigation', () => {
    it('navigates to the next day when Continue is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Continue' }));

      expect(navigate).toHaveBeenCalledWith('/days/js-day-06');
    });

    it('navigates when a completed day is clicked in the schedule', async () => {
      const user = userEvent.setup();
      vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

      renderPage();

      await screen.findByText('JavaScript Module — Schedule');
      await user.click(screen.getByRole('button', { name: '01' }));

      expect(navigate).toHaveBeenCalledWith('/days/js-day-01');
    });

    it('does not navigate when a locked day is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(getDashboard).mockResolvedValue(mockDashboard);

      renderPage();

      await screen.findByText('JavaScript Module — Schedule');
      await user.click(screen.getByRole('button', { name: '07' }));

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('new trainee', () => {
    const newTraineeDashboard: DashboardResponse = {
      ...mockDashboard,
      nextDay: { ...day('html', 1, 'UNLOCKED'), courseTotalDays: 2 },
      totalDaysCompleteOverall: 0,
      completedCourseIds: [], // new
    };

    it('shows HTML Day 1 on the card', async () => {
      vi.mocked(getDashboard).mockResolvedValue(newTraineeDashboard);

      renderPage();

      expect(await screen.findByText('html lesson 1')).toBeInTheDocument();
      expect(screen.getByText('Day 1 of 2')).toBeInTheDocument();
    });

    it('starts on the HTML track', async () => {
      vi.mocked(getDashboard).mockResolvedValue(newTraineeDashboard);

      renderPage();

      expect(await screen.findByText('HTML Module — Schedule')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'HTML' })).toHaveAttribute('aria-selected', 'true');
      expect(getCourseDays).toHaveBeenCalledWith('html');
    });

    // new
    it('shows no certificate badges', async () => {
      vi.mocked(getDashboard).mockResolvedValue(newTraineeDashboard);

      renderPage();

      expect(await screen.findByText('Certificates: none')).toBeInTheDocument();
    });
  });

  describe('all courses completed', () => {
    const finishedDashboard: DashboardResponse = {
      ...mockDashboard,
      nextDay: null,
      totalDaysCompleteOverall: 60,
    };

    it('shows a completion message instead of the lesson card', async () => {
      vi.mocked(getDashboard).mockResolvedValue(finishedDashboard);

      renderPage();

      expect(
        await screen.findByText("You've completed every course. Great work!")
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    });

    it('falls back to the HTML track', async () => {
      vi.mocked(getDashboard).mockResolvedValue(finishedDashboard);

      renderPage();

      expect(await screen.findByText('HTML Module — Schedule')).toBeInTheDocument();
    });
  });
});
