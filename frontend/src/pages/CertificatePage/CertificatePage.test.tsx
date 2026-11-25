import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseCertificate } from '@itp/types';

import { ToastProvider } from '../../components/Toast';
import CertificatePage from './CertificatePage';
import { getCertificate } from '../../api/certificate';
import { ApiError } from '../../api/errors';
import { formatHours } from '../../lib/certificate';

vi.mock('../../api/certificate', () => ({
  getCertificate: vi.fn(),
}));

vi.mock('../../components/Header', () => ({
  default: () => <header>Header</header>,
}));

const certificate: CourseCertificate = {
  courseId: 'css',
  courseTitle: 'CSS',
  traineeName: 'Asha Rao',
  daysCompleted: 15,
  startedAt: '2026-10-01T09:00:00.000Z',
  completedAt: '2026-10-06T09:00:00.000Z',
  issuedAt: '2026-10-07T09:00:00.000Z',
  timeSpentSeconds: 7200,
  certificateId: 'VK-3F9A2C71B0ABCDEF1234',
  status: 'ACTIVE',
  signature: 'c2lnbmF0dXJl',
  signatureAlgorithm: 'Ed25519',
  signatureVersion: 'v1',
};

function renderPage(courseId = 'css') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/certificates/${courseId}`]}>
        <Routes>
          <Route path="/certificates/:courseId" element={<CertificatePage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

const hasLandscapeStyle = () =>
  Array.from(document.head.querySelectorAll('style')).some((style) =>
    style.textContent?.includes('A4 landscape')
  );

const printMock = vi.fn();
describe('CertificatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.title = 'Vinkup';
    delete document.documentElement.dataset.theme;
    printMock.mockReset();
    window.print = printMock;
  });

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    delete window.desktop;
  });

  it('shows the loading state while the certificate loads', () => {
    vi.mocked(getCertificate).mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText('Loading certificate…')).toBeInTheDocument();
  });

  it('asks for the certificate of the course in the URL', async () => {
    vi.mocked(getCertificate).mockResolvedValue(certificate);

    renderPage('css');

    await screen.findByText('Asha Rao');
    expect(getCertificate).toHaveBeenCalledTimes(1);
    expect(getCertificate).toHaveBeenCalledWith('css');
  });

  it('renders the certificate', async () => {
    vi.mocked(getCertificate).mockResolvedValue(certificate);

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Certificate of completion' })
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Vinkup' })).toBeInTheDocument();

    // Main block — broken into separate <p>s so each can be matched directly.
    expect(screen.getByText('This certifies that')).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('has successfully completed the course in')).toBeInTheDocument();
    expect(screen.getByText('CSS')).toBeInTheDocument();

    // The description <p> mixes plain text with two <span>s. `getByText` only
    // matches direct text nodes, so we use a function matcher that reads
    // `element.textContent` to include the spans.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent ===
            `a 15-day training programme, with a total learning time of ${formatHours(
              certificate.timeSpentSeconds
            )}.`
      )
    ).toBeInTheDocument();

    // Footer.
    expect(screen.getByText('Certificate ID VK-3F9A2C71B0ABCDEF1234')).toBeInTheDocument();
    expect(
      screen.getByText('Issued 6 October 2026 · Vinkup · In-House Trainee Training Platform')
    ).toBeInTheDocument();
  });

  it('offers a link back to the dashboard', async () => {
    vi.mocked(getCertificate).mockResolvedValue(certificate);

    renderPage();

    expect(await screen.findByRole('link', { name: /Back to Dashboard/ })).toHaveAttribute(
      'href',
      '/'
    );
  });

  describe('PDF saving', () => {
    it('saves a PDF through the desktop app instead of opening the system print flow', async () => {
      const user = userEvent.setup();
      const savePdf = vi.fn().mockResolvedValue({
        fileName: 'Vinkup certificate - CSS - Asha Rao.pdf',
        location: 'Downloads',
      });
      Object.defineProperty(window, 'desktop', {
        configurable: true,
        value: { certificate: { savePdf } },
      });
      vi.mocked(getCertificate).mockResolvedValue(certificate);

      renderPage();
      await user.click(await screen.findByRole('button', { name: /Save as PDF/ }));

      expect(savePdf).toHaveBeenCalledWith('Vinkup certificate - CSS - Asha Rao');
      expect(printMock).not.toHaveBeenCalled();
      expect(document.title).toBe('Vinkup');
      expect(
        await screen.findByText('Saved Vinkup certificate - CSS - Asha Rao.pdf to Downloads.')
      ).toBeInTheDocument();
    });

    it('shows an error and restores the page if saving a PDF fails', async () => {
      const user = userEvent.setup();
      Object.defineProperty(window, 'desktop', {
        configurable: true,
        value: {
          certificate: {
            savePdf: vi.fn().mockRejectedValue(new Error('Disk is full')),
          },
        },
      });
      vi.mocked(getCertificate).mockResolvedValue(certificate);
      document.documentElement.dataset.theme = 'dark';

      renderPage();
      await user.click(await screen.findByRole('button', { name: /Save as PDF/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Unable to save certificate PDF: Disk is full'
      );
      expect(document.title).toBe('Vinkup');
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('does not open a print dialog outside the desktop app', async () => {
      const user = userEvent.setup();
      vi.mocked(getCertificate).mockResolvedValue(certificate);

      renderPage();
      await user.click(await screen.findByRole('button', { name: /Save as PDF/ }));

      expect(printMock).not.toHaveBeenCalled();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Certificate PDF downloads are only available in the VinkUp desktop app.'
      );
    });

    it('uses A4 landscape only while the page is open', async () => {
      vi.mocked(getCertificate).mockResolvedValue(certificate);

      const { unmount } = renderPage();
      await screen.findByText('Asha Rao');
      expect(hasLandscapeStyle()).toBe(true);

      unmount();
      expect(hasLandscapeStyle()).toBe(false);
    });
  });

  describe('when the course is not finished (403)', () => {
    beforeEach(() => {
      vi.mocked(getCertificate).mockRejectedValue(
        new ApiError(403, 'FORBIDDEN', 'Finish every day of this course to get its certificate.')
      );
    });

    it('shows a friendly message with the course name', async () => {
      renderPage('css');

      expect(
        await screen.findByRole('heading', {
          name: 'Finish every day of CSS to get this certificate',
        })
      ).toBeInTheDocument();
    });

    it('links back to the dashboard and shows no certificate', async () => {
      renderPage('css');

      expect(await screen.findByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute(
        'href',
        '/'
      );
      expect(
        screen.queryByRole('heading', { name: 'Certificate of completion' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Print/ })).not.toBeInTheDocument();
    });
  });

  it('shows "Course not found" for an unknown course (404)', async () => {
    vi.mocked(getCertificate).mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'Course not found.')
    );

    renderPage('cobol');

    expect(await screen.findByRole('heading', { name: 'Course not found' })).toBeInTheDocument();
  });

  describe('when loading fails for another reason', () => {
    it('shows the error and loads again on Try again', async () => {
      const user = userEvent.setup();
      vi.mocked(getCertificate)
        .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', "Can't reach the server."))
        .mockResolvedValueOnce(certificate);

      renderPage();

      expect(await screen.findByText("Can't reach the server.")).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
      expect(getCertificate).toHaveBeenCalledTimes(2);
    });
  });
});
