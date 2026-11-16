import type { Profile } from 'passport-google-oauth20';
import { env } from '../../config/env';
import { AuthRepository } from './auth.repository';
import {
  DomainNotPermittedError,
  NotProvisionedError,
  UnauthorizedError,
} from '../../errors/AppError';

const authRepository = new AuthRepository();

export class AuthService {
  async verifyGoogleProfile(profile: Profile): Promise<Express.User> {
    const email = profile.emails?.[0]?.value;

    if (!email) throw new UnauthorizedError('Google did not return an email address.');

    if (!email.endsWith(`@${env.ALLOWED_EMAIL_DOMAIN}`)) throw new DomainNotPermittedError();

    const staff = await authRepository.findActiveStaffByEmail(email);
    if (staff) {
      await authRepository.recordAdminLogin(staff.id);

      return {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role === 'MANAGER' ? 'manager' : 'mentor',
      };
    }

    const trainee = await authRepository.findBymail(email);
    if (!trainee) throw new NotProvisionedError();

    return {
      id: trainee.id,
      email: trainee.email,
      name: trainee.name,
      role: 'trainee',
    };
  }
}
