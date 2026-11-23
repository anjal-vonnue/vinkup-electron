import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CertificateVerificationResponse } from '@itp/types';
import CertificateVerificationPage from './CertificateVerificationPage';
import { verifyCertificate } from '../../api/certificate';
import { ApiError } from '../../api/errors';
import { useAuth } from '../../context/Useauth';

vi.mock('../../api/certificate', () => ({
  verifyCertificate: vi.fn(),
}));

vi.mock('../../context/Useauth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../components/Header', () => ({
  default: () => <header>TraineeHeader</header>,
}));

vi.mock('../../components/AdminHeader', () => ({
  default: ({ badge }: { badge?: string }) => <header>{badge ? `AdminHeader:${badge}` : 'AdminHeader'}</header>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <CertificateVerificationPage />
    </MemoryRouter>
  );
}

const validResult: CertificateVerificationResponse = {
  valid: true,
  signatureValid: true,
  status: 'ACTIVE',
  certificateId: 'VK-3F9A2C71B0ABCDEF1234',
  traineeName: 'Asha Rao',
  courseTitle: 'CSS',
  completedAt: '2026-10-06T09:00:00.000Z',
  issuedAt: '2026-10-07T09:00:00.000Z',
  message: 'Certificate is valid.',
};

describe('CertificateVerificationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>);
  });

  it('verifies a certificate and displays valid details', async () => {
    const user = userEvent.setup();
    vi.mocked(verifyCertificate).mockResolvedValue(validResult);
    renderPage();

    await user.type(screen.getByLabelText('Certificate ID'), 'vk-3f9a2c71b0abcdef1234');
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(verifyCertificate).toHaveBeenCalledWith('VK-3F9A2C71B0ABCDEF1234');
    expect(await screen.findByText('Authentic certificate')).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('CSS')).toBeInTheDocument();
    expect(screen.getByText('6 October 2026')).toBeInTheDocument();
    expect(screen.getByText('7 October 2026')).toBeInTheDocument();
  });

  it('shows loading state while verifying', async () => {
    const user = userEvent.setup();
    vi.mocked(verifyCertificate).mockReturnValue(new Promise(() => {}));
    renderPage();

    await user.type(screen.getByLabelText('Certificate ID'), 'VK-3F9A2C71B0ABCDEF1234');
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(screen.getByRole('button', { name: /Verifying/ })).toBeDisabled();
  });

  it('shows invalid status for unknown certificates', async () => {
    const user = userEvent.setup();
    vi.mocked(verifyCertificate).mockResolvedValue({
      ...validResult,
      valid: false,
      signatureValid: false,
      status: 'UNKNOWN',
      traineeName: null,
      courseTitle: null,
      completedAt: null,
      issuedAt: null,
      message: 'Certificate not found.',
    });
    renderPage();

    await user.type(screen.getByLabelText('Certificate ID'), 'VK-FFFFFFFFFFFFFFFFFFFF');
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(await screen.findByText('Certificate not found')).toBeInTheDocument();
  });

  it('shows invalid signature status', async () => {
    const user = userEvent.setup();
    vi.mocked(verifyCertificate).mockResolvedValue({
      ...validResult,
      valid: false,
      signatureValid: false,
      status: 'ACTIVE',
      message: 'Certificate signature is invalid.',
    });
    renderPage();

    await user.type(screen.getByLabelText('Certificate ID'), validResult.certificateId);
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(await screen.findByText('Invalid certificate signature')).toBeInTheDocument();
  });

  it('shows revoked certificate status', async () => {
    const user = userEvent.setup();
    vi.mocked(verifyCertificate).mockResolvedValue({
      ...validResult,
      valid: false,
      signatureValid: true,
      status: 'REVOKED',
      message: 'Certificate has been revoked.',
    });
    renderPage();

    await user.type(screen.getByLabelText('Certificate ID'), validResult.certificateId);
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(await screen.findByText('Revoked certificate')).toBeInTheDocument();
  });

  it('handles API failures gracefully', async () => {
    const user = userEvent.setup();
    vi.mocked(verifyCertificate).mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'Too many requests.'));
    renderPage();

    await user.type(screen.getByLabelText('Certificate ID'), validResult.certificateId);
    await user.click(screen.getByRole('button', { name: /Verify/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests.');
  });

  it('shows trainee header for public/trainee users', () => {
    renderPage();
    expect(screen.getByText('TraineeHeader')).toBeInTheDocument();
  });

  it('shows admin header for mentor users', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { role: 'mentor' } } as ReturnType<typeof useAuth>);
    renderPage();
    expect(screen.getByText('AdminHeader')).toBeInTheDocument();
  });

  it('shows manager admin header for manager users', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { role: 'manager' } } as ReturnType<typeof useAuth>);
    renderPage();
    expect(screen.getByText('AdminHeader:Manager view')).toBeInTheDocument();
  });
});
