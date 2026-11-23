import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CourseCertificate } from '@itp/types';
import CertificateList from './CertificateList';

const certificates: CourseCertificate[] = [
  {
    courseId: 'html',
    courseTitle: 'HTML',
    traineeName: 'Asha Rao',
    daysCompleted: 5,
    completedAt: '2026-10-05T10:00:00.000Z',
    issuedAt: '2026-10-05T10:05:00.000Z',
    certificateId: 'VK-HTML0000000000000000',
    status: 'ACTIVE',
    signature: 'sig-html',
    signatureAlgorithm: 'Ed25519',
    signatureVersion: 'v1',
  },
  {
    courseId: 'node',
    courseTitle: 'Node.js',
    traineeName: 'Asha Rao',
    daysCompleted: 5,
    completedAt: '2026-10-06T09:00:00.000Z',
    issuedAt: '2026-10-06T09:05:00.000Z',
    certificateId: 'VK-NODE0000000000000000',
    status: 'ACTIVE',
    signature: 'sig-node',
    signatureAlgorithm: 'Ed25519',
    signatureVersion: 'v1',
  },
];

function renderList(list: CourseCertificate[]) {
  return render(
    <MemoryRouter>
      <CertificateList certificates={list} />
    </MemoryRouter>
  );
}

describe('CertificateList', () => {
  it('renders nothing when there are no certificates', () => {
    const { container } = renderList([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists each certificate with its course and date', () => {
    renderList(certificates);

    expect(screen.getByRole('heading', { name: 'Certificates' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /HTML/ })).toHaveTextContent('5 October 2026');
    expect(screen.getByRole('link', { name: /Node\.js/ })).toHaveTextContent('6 October 2026');
  });

  it('links each certificate to its page', () => {
    renderList(certificates);

    expect(screen.getByRole('link', { name: /HTML/ })).toHaveAttribute(
      'href',
      '/certificates/html'
    );
    expect(screen.getByRole('link', { name: /Node\.js/ })).toHaveAttribute(
      'href',
      '/certificates/node'
    );
  });
});
