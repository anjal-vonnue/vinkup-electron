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

    const admin = await authRepository.findActiveAdminByEmail(email);
    if (admin) {
      await authRepository.recordAdminLogin(admin.id);

      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'mentor',
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
