import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Profile } from 'passport-google-oauth20';

import { AuthService } from '../auth.service.js';
import {
  UnauthorizedError,
  DomainNotPermittedError,
  NotProvisionedError,
} from '../../../errors/AppError.js';

const { findBymail, findActiveStaffByEmail, recordAdminLogin } = vi.hoisted(() => ({
  findBymail: vi.fn(),
  findActiveStaffByEmail: vi.fn(),
  recordAdminLogin: vi.fn(),
}));

// Exports both shapes, so this works whether the service does
// `new AuthRepository()` or imports a shared `authRepository` instance.
vi.mock('../auth.repository', () => {
  class AuthRepository {
    findBymail = findBymail;
    findActiveStaffByEmail = findActiveStaffByEmail;
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
    role: 'MENTOR' as const,
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
    findActiveStaffByEmail.mockReset();
    recordAdminLogin.mockReset();
    // By default nobody is an admin
    findActiveStaffByEmail.mockResolvedValue(null);
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

      expect(findActiveStaffByEmail).toHaveBeenCalledWith(allowedEmail);
      expect(findActiveStaffByEmail.mock.invocationCallOrder[0]).toBeLessThan(
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

  describe('staff accounts', () => {
    it('maps an existing MENTOR account to the mentor role', async () => {
      findActiveStaffByEmail.mockResolvedValue(admin);

      const result = await authService.verifyGoogleProfile(createProfile(admin.email));

      expect(result.role).toBe('mentor');
    });

    it('maps a MANAGER staff account to the manager role', async () => {
      const manager = {
        ...admin,
        email: 'manager@company.com',
        name: 'Test Manager',
        role: 'MANAGER' as const,
      };
      findActiveStaffByEmail.mockResolvedValue(manager);

      const result = await authService.verifyGoogleProfile(createProfile(manager.email));

      expect(result).toEqual({
        id: manager.id,
        email: manager.email,
        name: manager.name,
        role: 'manager',
      });
    });

    it('returns id, email, name and role "mentor" without a trainee row', async () => {
      findActiveStaffByEmail.mockResolvedValue(admin);

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
      findActiveStaffByEmail.mockResolvedValue(admin);

      await authService.verifyGoogleProfile(createProfile(admin.email));

      expect(recordAdminLogin).toHaveBeenCalledTimes(1);
      expect(recordAdminLogin).toHaveBeenCalledWith(admin.id);
    });

    it('logs in as mentor when the email is in both tables', async () => {
      findActiveStaffByEmail.mockResolvedValue(admin);
      findBymail.mockResolvedValue({ ...trainee, email: admin.email });

      const result = await authService.verifyGoogleProfile(createProfile(admin.email));

      expect(result.role).toBe('mentor');
      expect(findBymail).not.toHaveBeenCalled();
    });

    it('treats a deactivated admin as not an admin', async () => {
      // The repository only returns ACTIVE admins, so a deactivated one comes back as null
      findActiveStaffByEmail.mockResolvedValue(null);
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

      expect(findActiveStaffByEmail).not.toHaveBeenCalled();
    });

    it('fails the login when recording the login time fails', async () => {
      const dbError = new Error('db down');
      findActiveStaffByEmail.mockResolvedValue(admin);
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

      expect(findActiveStaffByEmail).not.toHaveBeenCalled();
      expect(findBymail).not.toHaveBeenCalled();
    });

    it('throws DomainNotPermittedError for an email outside the allowed domain', async () => {
      await expect(
        authService.verifyGoogleProfile(createProfile('user@gmail.com'))
      ).rejects.toBeInstanceOf(DomainNotPermittedError);

      // The domain check must run before any database lookup
      expect(findActiveStaffByEmail).not.toHaveBeenCalled();
      expect(findBymail).not.toHaveBeenCalled();
    });

    it.each(['user@notcompany.com', 'user@company.com.evil.com', 'company.com@gmail.com'])(
      'rejects the lookalike address %s',
      async (email) => {
        await expect(authService.verifyGoogleProfile(createProfile(email))).rejects.toBeInstanceOf(
          DomainNotPermittedError
        );

        expect(findActiveStaffByEmail).not.toHaveBeenCalled();
        expect(findBymail).not.toHaveBeenCalled();
      }
    );

    it('lets admin-lookup errors propagate unchanged', async () => {
      const dbError = new Error('db down');
      findActiveStaffByEmail.mockRejectedValue(dbError);

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
