import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatsSummary from './StatsSummary';

describe('StatsSummary', () => {
  const total = {
    activeSeconds: 153000,
    codingSeconds: 51300,
  };

  const typingStats = {
    averageWpm: 68.5,
    averageAccuracy: 97.2,
    highestWpm: 85,
    highestWpmAccuracy: 99.1,
  };

  it('renders total time', () => {
    render(<StatsSummary total={total} typingStats={typingStats} />);

    const stats = screen.getByRole('region', {
      name: 'Training statistics',
    });

    expect(within(stats).getByText('TOTAL TIME')).toBeInTheDocument();
    expect(within(stats).getByText('42h 30m')).toBeInTheDocument();
  });

  it('renders active coding time', () => {
    render(<StatsSummary total={total} typingStats={typingStats} />);

    const stats = screen.getByRole('region', {
      name: 'Training statistics',
    });

    expect(within(stats).getByText('ACTIVE CODING')).toBeInTheDocument();
    expect(within(stats).getByText('14h 15m')).toBeInTheDocument();
  });

  it('renders reading and lessons time', () => {
    render(<StatsSummary total={total} typingStats={typingStats} />);

    const stats = screen.getByRole('region', {
      name: 'Training statistics',
    });

    expect(within(stats).getByText('READING & LESSONS')).toBeInTheDocument();
    expect(within(stats).getByText('28h 15m')).toBeInTheDocument();
  });

  it('renders average typing speed', () => {
    render(<StatsSummary total={total} typingStats={typingStats} />);

    expect(screen.getByText('AVERAGE WPM (LAST 10 TESTS)')).toBeInTheDocument();
    expect(screen.getByText('68.5 WPM')).toBeInTheDocument();
  });

  it('renders average typing accuracy', () => {
    render(<StatsSummary total={total} typingStats={typingStats} />);

    expect(screen.getByText('97.2% accuracy')).toBeInTheDocument();
  });

  it('renders highest typing speed', () => {
    render(<StatsSummary total={total} typingStats={typingStats} />);

    expect(screen.getByText('HIGHEST WPM')).toBeInTheDocument();
    expect(screen.getByText('85 WPM')).toBeInTheDocument();
  });

  it('renders accuracy for the highest WPM result', () => {
    render(<StatsSummary total={total} typingStats={typingStats} />);

    expect(screen.getByText('99.1% accuracy')).toBeInTheDocument();
  });

  it('renders unavailable values when no typing results exist', () => {
    render(
      <StatsSummary
        total={total}
        typingStats={{
          averageWpm: 0,
          averageAccuracy: 0,
          highestWpm: null,
          highestWpmAccuracy: null,
        }}
      />
    );

    expect(screen.getByText('0 WPM')).toBeInTheDocument();
    expect(screen.getByText('0.0% accuracy')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
