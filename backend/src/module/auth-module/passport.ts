import passport from 'passport';
import {
  Strategy as GoogleStrategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';
import { env, googleDesktopCallbackUrl } from '../../config/env';
import { AuthService } from './auth.service';
import { AppError } from '../../errors/AppError';

const authService = new AuthService();

/**
 * The web and desktop flows authenticate the same Google identity through the
 * same Vinkup lookup rules. Only the OAuth client configuration (callback URL)
 * and the post-callback handoff differ.
 */
const verifyGoogleProfile = (
  _accessToken: string,
  _refreshToken: string,
  profile: Profile,
  done: VerifyCallback
): void => {
  void (async () => {
    try {
      const user = await authService.verifyGoogleProfile(profile);
      done(null, user);
    } catch (error) {
      const email = profile.emails?.[0]?.value;
      if (error instanceof AppError) {
        done(null, false, { message: error.code, email });
      } else {
        done(error);
      }
    }
  })();
};

// Existing browser flow: keeps the same strategy name and callback URL.
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    verifyGoogleProfile
  )
);

/**
 * Electron flow. It is a separate Passport strategy because Google requires
 * the redirect URI sent to the token endpoint to match the one used in the
 * authorization request. The same confidential Web OAuth client is used; the
 * desktop app never receives its secret.
 */
const desktopStrategy = new GoogleStrategy(
  {
    clientID: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackURL: googleDesktopCallbackUrl,
  },
  verifyGoogleProfile
);
desktopStrategy.name = 'google-desktop';
passport.use(desktopStrategy);

export default passport;
