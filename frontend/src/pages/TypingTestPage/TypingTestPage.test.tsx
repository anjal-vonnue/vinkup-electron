import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TypingProgress, PassageOptions } from '../../lib/typingStats';
import type { TypingResultRecord, TypingTestStats } from '@itp/types';

import TypingTestPage from './TypingTestPage';
import { getTypingResults, saveTypingResult } from '../../api/typingTest';
import { ApiError } from '../../api/errors';

vi.mock('../../api/typingTest', () => ({
  getTypingResults: vi.fn(),
  saveTypingResult: vi.fn(),
}));

vi.mock('../../components/Header', () => ({
  default: () => <header>Header</header>,
}));

vi.mock('../../components/HelpButton', () => ({
  default: () => (
    <a href="/help" aria-label="Open help">
      Help
    </a>
  ),
}));

vi.mock('../../components/PassageDisplay', () => ({
  default: ({
    passage,
    progress,
    cursorPosition,
  }: {
    passage: string;
    progress: TypingProgress;
    cursorPosition: number;
  }) => (
    <div aria-label="Text to type">
      <span>{passage}</span>
      <span data-testid="cursor-position">{cursorPosition}</span>
      <span data-testid="typed-characters">
        {progress.typedCharacters.filter(Boolean).join('')}
      </span>
    </div>
  ),
}));

vi.mock('../../components/TestHistory', () => ({
  default: ({ results }: { results: TypingResultRecord[] }) => (
    <div data-testid="test-history">
      {results.map((result) => (
        <div key={result.id}>
          <span>{result.wpm} WPM</span>
          <span>{result.accuracy}%</span>
        </div>
      ))}
    </div>
  ),
}));

type MockTypingTestState = {
  passage: string;
  progress: TypingProgress;
  cursorPosition: number;
  status: 'idle' | 'running' | 'finished';
  secondsLeft: number;
  durationSeconds: number;
  options: PassageOptions;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  restart: (nextDuration?: number) => void;
  toggleOption: (key: keyof PassageOptions) => void;
  isPaused: boolean;
};

type UseTypingTestMock = (
  initialDuration: number,
  onFinish: (stats: TypingTestStats) => void
) => MockTypingTestState;

const mockUseTypingTest = vi.fn<UseTypingTestMock>();

vi.mock('../../hooks/useTypingTest', () => ({
  useTypingTest: (initialDuration: number, onFinish: (stats: TypingTestStats) => void) =>
    mockUseTypingTest(initialDuration, onFinish),
}));

const history: TypingResultRecord[] = [
  {
    id: 'typing-2',
    wpm: 51,
    accuracy: 98,
    takenAt: '2026-09-30T14:20:00.000Z',
  },
  {
    id: 'typing-1',
    wpm: 42,
    accuracy: 94,
    takenAt: '2026-09-30T09:00:00.000Z',
  },
];

const savedResult: TypingResultRecord = {
  id: 'typing-3',
  wpm: 24,
  accuracy: 100,
  takenAt: '2026-09-30T15:00:00.000Z',
};

const defaultTypingTestState: MockTypingTestState = {
  passage: 'hello world',
  progress: {
    typedCharacters: Array<string | null>(11).fill(null),
    skippedPositions: new Set<number>(),
    extraCharactersByPosition: {},
    correctedMistakes: 0,
  },
  cursorPosition: 0,
  status: 'idle',
  secondsLeft: 30,
  durationSeconds: 30,
  options: {
    punctuation: false,
    numbers: false,
  },
  handleKeyDown: vi.fn<(event: ReactKeyboardEvent<HTMLInputElement>) => void>(),
  restart: vi.fn<(nextDuration?: number) => void>(),
  toggleOption: vi.fn<(key: keyof PassageOptions) => void>(),
  isPaused: false,
};

function getTypingInput() {
  return screen.getByRole('textbox', {
    name: 'Type the text shown above',
  });
}

function renderTypingTestPage(overrides: Partial<MockTypingTestState> = {}) {
  if (Object.keys(overrides).length > 0) {
    mockUseTypingTest.mockReturnValue({
      ...defaultTypingTestState,
      ...overrides,
    });
  }

  return render(<TypingTestPage />);
}

describe('TypingTestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getTypingResults).mockResolvedValue(history);
    vi.mocked(saveTypingResult).mockResolvedValue(savedResult);

    mockUseTypingTest.mockReturnValue({
      ...defaultTypingTestState,
      handleKeyDown: vi.fn(),
      restart: vi.fn(),
      toggleOption: vi.fn(),
    });
  });

  describe('rendering', () => {
    it('renders the page header and title', () => {
      renderTypingTestPage();

      expect(screen.getByText('Header')).toBeInTheDocument();

      expect(screen.getByRole('heading', { name: 'Typing Test' })).toBeInTheDocument();

      expect(screen.getByText('Test your typing speed and accuracy!')).toBeInTheDocument();
    });

    it('renders the passage and typing input', () => {
      renderTypingTestPage();

      expect(screen.getByLabelText('Text to type')).toHaveTextContent('hello world');

      expect(getTypingInput()).toBeInTheDocument();
    });

    it('renders the help button', () => {
      renderTypingTestPage();

      expect(screen.getByRole('link', { name: 'Open help' })).toBeInTheDocument();
    });

    it('renders the timer with the correct value', () => {
      renderTypingTestPage();

      expect(screen.getByRole('timer')).toHaveTextContent('00:30');
    });

    it('passes the default duration to the typing hook', () => {
      renderTypingTestPage();

      expect(mockUseTypingTest).toHaveBeenCalledWith(30, expect.any(Function));
    });
  });

  describe('typing interaction', () => {
    it('passes keyboard events to the typing hook', async () => {
      const user = userEvent.setup();
      const handleKeyDown = vi.fn();

      renderTypingTestPage({ handleKeyDown });

      await user.type(getTypingInput(), 'h');

      expect(handleKeyDown).toHaveBeenCalled();
    });

    it('prevents pasting into the typing input', () => {
      renderTypingTestPage();

      const input = getTypingInput();

      const event = new Event('paste', {
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        input.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
    });

    it('prevents dropping text into the typing input', () => {
      renderTypingTestPage();

      const input = getTypingInput();

      const event = new Event('drop', {
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        input.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
    });

    it('makes the input read-only when the test is finished', () => {
      renderTypingTestPage({
        status: 'finished',
        secondsLeft: 0,
      });

      expect(getTypingInput()).toHaveAttribute('readonly');
    });
  });

  describe('history', () => {
    it('shows a loading message while history loads', () => {
      vi.mocked(getTypingResults).mockReturnValue(new Promise<TypingResultRecord[]>(() => {}));

      renderTypingTestPage();

      expect(screen.getByText('Loading history...')).toBeInTheDocument();
    });

    it('displays history after loading', async () => {
      renderTypingTestPage();

      expect(await screen.findByText('51 WPM')).toBeInTheDocument();
      expect(screen.getByText('42 WPM')).toBeInTheDocument();

      expect(getTypingResults).toHaveBeenCalledTimes(1);
    });

    it('displays an error when history fails to load', async () => {
      vi.mocked(getTypingResults).mockRejectedValue(
        new ApiError(500, 'INTERNAL_ERROR', 'Failed to load history')
      );

      renderTypingTestPage();

      expect(await screen.findByText('Failed to load history')).toBeInTheDocument();

      expect(getTypingInput()).toBeInTheDocument();
    });
  });

  describe('duration and options', () => {
    it('marks the selected duration as active', () => {
      renderTypingTestPage({
        durationSeconds: 30,
      });

      expect(screen.getByRole('button', { name: '30s' })).toHaveAttribute('aria-pressed', 'true');

      expect(screen.getByRole('button', { name: '60s' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('restarts the test when another duration is selected', async () => {
      const user = userEvent.setup();
      const restart = vi.fn();

      renderTypingTestPage({ restart });

      await user.click(screen.getByRole('button', { name: '60s' }));

      expect(restart).toHaveBeenCalledWith(60);
    });

    it('restarts the test when Restart Test is clicked', async () => {
      const user = userEvent.setup();
      const restart = vi.fn();

      renderTypingTestPage({ restart });

      await user.click(screen.getByRole('button', { name: 'Restart Test' }));

      expect(restart).toHaveBeenCalledWith(undefined);
    });

    it('toggles punctuation', async () => {
      const user = userEvent.setup();
      const toggleOption = vi.fn();

      renderTypingTestPage({ toggleOption });

      const punctuationButton = screen.getByRole('button', {
        name: 'punctuation',
      });

      expect(punctuationButton).toHaveAttribute('aria-pressed', 'false');

      await user.click(punctuationButton);

      expect(toggleOption).toHaveBeenCalledWith('punctuation');
    });

    it('toggles numbers', async () => {
      const user = userEvent.setup();
      const toggleOption = vi.fn();

      renderTypingTestPage({ toggleOption });

      const numbersButton = screen.getByRole('button', {
        name: 'numbers',
      });

      expect(numbersButton).toHaveAttribute('aria-pressed', 'false');

      await user.click(numbersButton);

      expect(toggleOption).toHaveBeenCalledWith('numbers');
    });

    it('marks enabled options as active', () => {
      renderTypingTestPage({
        options: {
          punctuation: true,
          numbers: true,
        },
      });

      expect(screen.getByRole('button', { name: 'punctuation' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );

      expect(screen.getByRole('button', { name: 'numbers' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });
  });

  describe('pause state', () => {
    it('shows the paused overlay when the test is paused', () => {
      renderTypingTestPage({
        status: 'running',
        secondsLeft: 42,
        isPaused: true,
      });

      expect(screen.getByText('PAUSED')).toBeInTheDocument();

      expect(screen.getByText('Press any key to continue')).toBeInTheDocument();

      expect(screen.getByRole('timer')).toHaveTextContent('00:42');
    });

    it('does not show the paused overlay when the test is not paused', () => {
      renderTypingTestPage({
        status: 'running',
        isPaused: false,
      });

      expect(screen.queryByText('PAUSED')).not.toBeInTheDocument();
    });
  });

  describe('test completion', () => {
    it('shows the timeout overlay when the test finishes', () => {
      renderTypingTestPage({
        status: 'finished',
        secondsLeft: 0,
      });

      expect(screen.getByText("Time's up!")).toBeInTheDocument();

      expect(screen.getByRole('status')).toHaveTextContent(/Press\s+Enter\s+or Restart Test/);
    });

    it('displays the final WPM and accuracy', () => {
      let finishCallback: ((stats: TypingTestStats) => void) | undefined;

      mockUseTypingTest.mockImplementation((_duration, onFinish) => {
        finishCallback = onFinish;

        return {
          ...defaultTypingTestState,
          status: 'finished',
          secondsLeft: 0,
        };
      });

      renderTypingTestPage();

      act(() => {
        finishCallback?.({
          wpm: 45,
          accuracy: 96,
          durationSeconds: 30,
        });
      });

      expect(screen.getByText("Time's up!")).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('96%')).toBeInTheDocument();
      expect(screen.getByText('WPM')).toBeInTheDocument();
      expect(screen.getByText('ACCURACY')).toBeInTheDocument();
    });

    it('saves the finished test result', async () => {
      let finishCallback: ((stats: TypingTestStats) => void) | undefined;

      mockUseTypingTest.mockImplementation((_duration, onFinish) => {
        finishCallback = onFinish;

        return {
          ...defaultTypingTestState,
          status: 'finished',
          secondsLeft: 0,
        };
      });

      renderTypingTestPage();

      act(() => {
        finishCallback?.({
          wpm: 24,
          accuracy: 100,
          durationSeconds: 30,
        });
      });

      expect(saveTypingResult).toHaveBeenCalledWith({
        wpm: 24,
        accuracy: 100,
      });

      expect(await screen.findByText('51 WPM')).toBeInTheDocument();
    });

    it('reloads history after successfully saving a result', async () => {
      let finishCallback: ((stats: TypingTestStats) => void) | undefined;

      const updatedHistory = [savedResult, ...history];

      vi.mocked(getTypingResults)
        .mockResolvedValueOnce(history)
        .mockResolvedValueOnce(updatedHistory);

      mockUseTypingTest.mockImplementation((_duration, onFinish) => {
        finishCallback = onFinish;

        return {
          ...defaultTypingTestState,
          status: 'finished',
          secondsLeft: 0,
        };
      });

      renderTypingTestPage();

      expect(await screen.findByText('51 WPM')).toBeInTheDocument();

      act(() => {
        finishCallback?.({
          wpm: 24,
          accuracy: 100,
          durationSeconds: 30,
        });
      });

      expect(await screen.findByText('24 WPM')).toBeInTheDocument();

      expect(getTypingResults).toHaveBeenCalledTimes(2);
    });

    it('shows an error when saving the result fails', async () => {
      let finishCallback: ((stats: TypingTestStats) => void) | undefined;

      mockUseTypingTest.mockImplementation((_duration, onFinish) => {
        finishCallback = onFinish;

        return {
          ...defaultTypingTestState,
          status: 'finished',
          secondsLeft: 0,
        };
      });

      vi.mocked(saveTypingResult).mockRejectedValue(
        new ApiError(500, 'INTERNAL_ERROR', 'Server unavailable')
      );

      renderTypingTestPage();

      act(() => {
        finishCallback?.({
          wpm: 24,
          accuracy: 100,
          durationSeconds: 30,
        });
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    });

    it('disables controls while the result is being saved', async () => {
      let finishCallback: ((stats: TypingTestStats) => void) | undefined;

      mockUseTypingTest.mockImplementation((_duration, onFinish) => {
        finishCallback = onFinish;

        return {
          ...defaultTypingTestState,
          status: 'finished',
          secondsLeft: 0,
        };
      });

      vi.mocked(saveTypingResult).mockReturnValue(new Promise<TypingResultRecord>(() => {}));

      renderTypingTestPage();

      act(() => {
        finishCallback?.({
          wpm: 24,
          accuracy: 100,
          durationSeconds: 30,
        });
      });

      expect(await screen.findByText('Saving result...')).toBeInTheDocument();

      expect(screen.getByRole('button', { name: 'Restart Test' })).toBeDisabled();

      expect(screen.getByRole('button', { name: '30s' })).toBeDisabled();

      expect(screen.getByRole('button', { name: 'punctuation' })).toBeDisabled();
    });
  });
});
