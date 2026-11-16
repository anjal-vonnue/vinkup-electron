import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Profile } from 'passport-google-oauth20';

import { AuthService } from '../auth.service';
import {
  UnauthorizedError,
  DomainNotPermittedError,
  NotProvisionedError,
} from '../../../errors/AppError';

const { findBymail, findActiveAdminByEmail, recordAdminLogin } = vi.hoisted(() => ({
  findBymail: vi.fn(),
  findActiveAdminByEmail: vi.fn(),
  recordAdminLogin: vi.fn(),
}));

// Exports both shapes, so this works whether the service does
// `new AuthRepository()` or imports a shared `authRepository` instance.
vi.mock('../auth.repository', () => {
  class AuthRepository {
    findBymail = findBymail;
    findActiveAdminByEmail = findActiveAdminByEmail;
    recordAdminLogin = recordAdminLogin;
  }
  return { AuthRepository, authRepository: new AuthRepository() };
});

// The real config/env.ts parses process.env at import time. Pin the one value
// the service reads so the tests don't depend on the machine's .env.
vi.mock('../../../config/env', () => ({
  env: { ALLOWED_EMAIL_DOMAIN: 'company.com' },
}));

describe('AuthService.verifyGoogleProfile', () => {
  const authService = new AuthService();

  const allowedEmail = 'trainee@company.com';

  const trainee = {
    id: '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11',
    email: allowedEmail,
    name: 'Test Trainee',
  };

  // A full admin row, including columns that must NOT leak into the session user
  const admin = {
    id: '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77',
    email: 'mentor@company.com',
    name: 'Test Mentor',
    is_active: true,
    created_at: new Date('2026-10-01T00:00:00.000Z'),
    last_login_at: null,
  };

  const createProfile = (email?: string): Profile =>
    ({
      id: 'google-id-1',
      provider: 'google',
      displayName: 'Google Display Name',
      emails: email ? [{ value: email, verified: true }] : undefined,
    }) as Profile;

  beforeEach(() => {
    findBymail.mockReset();
    findActiveAdminByEmail.mockReset();
    recordAdminLogin.mockReset();
    // By default nobody is an admin
    findActiveAdminByEmail.mockResolvedValue(null);
    recordAdminLogin.mockResolvedValue(undefined);
  });

  describe('trainees', () => {
    it('returns the trainee with role "trainee" when on the allowed domain and provisioned', async () => {
      findBymail.mockResolvedValue(trainee);

      const result = await authService.verifyGoogleProfile(createProfile(allowedEmail));

      expect(result).toEqual({ ...trainee, role: 'trainee' });
      expect(findBymail).toHaveBeenCalledTimes(1);
      expect(findBymail).toHaveBeenCalledWith(allowedEmail);
    });

    it('checks the admin table before the trainee table', async () => {
      findBymail.mockResolvedValue(trainee);

      await authService.verifyGoogleProfile(createProfile(allowedEmail));

      expect(findActiveAdminByEmail).toHaveBeenCalledWith(allowedEmail);
      expect(findActiveAdminByEmail.mock.invocationCallOrder[0]).toBeLessThan(
        findBymail.mock.invocationCallOrder[0]
      );
    });

    it('does not record an admin login for a trainee', async () => {
      findBymail.mockResolvedValue(trainee);

      await authService.verifyGoogleProfile(createProfile(allowedEmail));

      expect(recordAdminLogin).not.toHaveBeenCalled();
    });

    it('throws NotProvisionedError when the email is in neither table', async () => {
      findBymail.mockResolvedValue(null);

      await expect(
        authService.verifyGoogleProfile(createProfile(allowedEmail))
      ).rejects.toBeInstanceOf(NotProvisionedError);

      expect(findBymail).toHaveBeenCalledWith(allowedEmail);
    });
  });

  describe('admins', () => {
    it('returns id, email, name and role "mentor" without a trainee row', async () => {
      findActiveAdminByEmail.mockResolvedValue(admin);

      const result = await authService.verifyGoogleProfile(createProfile(admin.email));

      expect(result).toEqual({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'mentor',
      });
      expect(findBymail).not.toHaveBeenCalled();
    });

    it('records the login time on the admin row', async () => {
      findActiveAdminByEmail.mockResolvedValue(admin);

      await authService.verifyGoogleProfile(createProfile(admin.email));

      expect(recordAdminLogin).toHaveBeenCalledTimes(1);
      expect(recordAdminLogin).toHaveBeenCalledWith(admin.id);
    });

    it('logs in as mentor when the email is in both tables', async () => {
      findActiveAdminByEmail.mockResolvedValue(admin);
      findBymail.mockResolvedValue({ ...trainee, email: admin.email });

      const result = await authService.verifyGoogleProfile(createProfile(admin.email));

      expect(result.role).toBe('mentor');
      expect(findBymail).not.toHaveBeenCalled();
    });

    it('treats a deactivated admin as not an admin', async () => {
      // The repository only returns ACTIVE admins, so a deactivated one comes back as null
      findActiveAdminByEmail.mockResolvedValue(null);
      findBymail.mockResolvedValue(null);

      await expect(
        authService.verifyGoogleProfile(createProfile(admin.email))
      ).rejects.toBeInstanceOf(NotProvisionedError);

      expect(findBymail).toHaveBeenCalledWith(admin.email);
      expect(recordAdminLogin).not.toHaveBeenCalled();
    });

    it('still applies the company-domain check to admins', async () => {
      await expect(
        authService.verifyGoogleProfile(createProfile('mentor@gmail.com'))
      ).rejects.toBeInstanceOf(DomainNotPermittedError);

      expect(findActiveAdminByEmail).not.toHaveBeenCalled();
    });

    it('fails the login when recording the login time fails', async () => {
      const dbError = new Error('db down');
      findActiveAdminByEmail.mockResolvedValue(admin);
      recordAdminLogin.mockRejectedValue(dbError);

      await expect(authService.verifyGoogleProfile(createProfile(admin.email))).rejects.toBe(
        dbError
      );
    });
  });

  describe('rejections', () => {
    it('throws UnauthorizedError when Google returns no email', async () => {
      await expect(authService.verifyGoogleProfile(createProfile())).rejects.toBeInstanceOf(
        UnauthorizedError
      );

      expect(findActiveAdminByEmail).not.toHaveBeenCalled();
      expect(findBymail).not.toHaveBeenCalled();
    });

    it('throws DomainNotPermittedError for an email outside the allowed domain', async () => {
      await expect(
        authService.verifyGoogleProfile(createProfile('user@gmail.com'))
      ).rejects.toBeInstanceOf(DomainNotPermittedError);

      // The domain check must run before any database lookup
      expect(findActiveAdminByEmail).not.toHaveBeenCalled();
      expect(findBymail).not.toHaveBeenCalled();
    });

    it.each(['user@notcompany.com', 'user@company.com.evil.com', 'company.com@gmail.com'])(
      'rejects the lookalike address %s',
      async (email) => {
        await expect(authService.verifyGoogleProfile(createProfile(email))).rejects.toBeInstanceOf(
          DomainNotPermittedError
        );

        expect(findActiveAdminByEmail).not.toHaveBeenCalled();
        expect(findBymail).not.toHaveBeenCalled();
      }
    );

    it('lets admin-lookup errors propagate unchanged', async () => {
      const dbError = new Error('db down');
      findActiveAdminByEmail.mockRejectedValue(dbError);

      await expect(authService.verifyGoogleProfile(createProfile(allowedEmail))).rejects.toBe(
        dbError
      );
      expect(findBymail).not.toHaveBeenCalled();
    });

    it('lets trainee-lookup errors propagate unchanged', async () => {
      const dbError = new Error('db down');
      findBymail.mockRejectedValue(dbError);

      await expect(authService.verifyGoogleProfile(createProfile(allowedEmail))).rejects.toBe(
        dbError
      );
    });
  });
});
