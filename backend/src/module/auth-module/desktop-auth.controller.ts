import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { MeResponse } from '@itp/types';
import { UnauthorizedError } from '../../errors/AppError';
import passport from './passport';
import { desktopAuthService, type DesktopAuthService } from './desktop-auth.service';
import type {
  CreateDesktopTransactionBody,
  ExchangeDesktopCodeBody,
  LogoutDesktopSessionBody,
  RefreshDesktopSessionBody,
} from './desktop-auth.schema';
import type { desktop_auth_transactionModel } from '../../generated/prisma/models';

const ERROR_ALLOWLIST = new Set(['DOMAIN_NOT_PERMITTED', 'NOT_PROVISIONED']);

function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

function googleErrorCode(req: Request): string {
  return req.query.error === 'access_denied' ? 'DESKTOP_AUTH_CANCELLED' : 'DESKTOP_AUTH_FAILED';
}

function passportErrorCode(info: unknown): string {
  const message = (info as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && ERROR_ALLOWLIST.has(message)
    ? message
    : 'DESKTOP_AUTH_FAILED';
}

export class DesktopAuthController {
  constructor(private readonly service: DesktopAuthService = desktopAuthService) {}

  createTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as CreateDesktopTransactionBody;
      const transaction = await this.service.createTransaction(body);
      res.status(201).json(transaction);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Browser entry point. The existing web flow stays at
   * `/api/auth/google`; this endpoint is only used by the Electron shell.
   */
  startGoogle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const transactionId = req.query.transaction;
      if (typeof transactionId !== 'string') {
        res.status(400).type('text/plain').send('Invalid sign-in request.');
        return;
      }

      const transaction = await this.service.findTransactionForStart(transactionId);
      const authenticate = passport.authenticate('google-desktop', {
        scope: ['profile', 'email'],
        prompt: 'select_account',
        session: false,
        state: transaction.state,
      }) as RequestHandler;

      authenticate(req, res, next);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Google redirects here after the system browser finishes. The backend then
   * redirects to the loopback listener with a one-time handoff code, never a
   * JWT or refresh token.
   */
  handleGoogleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let transaction: desktop_auth_transactionModel;
    try {
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      transaction = await this.service.findTransactionForCallback(state);
    } catch {
      res.status(400).type('text/plain').send('This sign-in attempt is invalid or has expired.');
      return;
    }

    try {
      const claimed = await this.service.claimTransaction(transaction.id);
      if (!claimed) {
        res.status(409).type('text/plain').send('This sign-in attempt was already completed.');
        return;
      }

      if (req.query.error) {
        const redirect = await this.service.failTransactionAndRedirect(
          transaction,
          googleErrorCode(req)
        );
        res.redirect(redirect);
        return;
      }

      const authenticate = passport.authenticate(
        'google-desktop',
        { session: false },
        (error: unknown, user: Express.User | false, info?: unknown) => {
          void (async () => {
            try {
              if (error || !user) {
                const redirect = await this.service.failTransactionAndRedirect(
                  transaction,
                  error ? 'DESKTOP_AUTH_FAILED' : passportErrorCode(info)
                );
                res.redirect(redirect);
                return;
              }

              const redirect = await this.service.completeTransaction(transaction, user);
              res.redirect(redirect);
            } catch (callbackError) {
              try {
                const redirect = await this.service.failTransactionAndRedirect(
                  transaction,
                  'DESKTOP_AUTH_FAILED'
                );
                res.redirect(redirect);
              } catch (redirectError) {
                next(redirectError ?? callbackError);
              }
            }
          })();
        }
      ) as RequestHandler;

      authenticate(req, res, next);
    } catch (error) {
      next(error);
    }
  };

  exchange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as ExchangeDesktopCodeBody;
      const session = await this.service.exchange(body.code, body.codeVerifier);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  };

  session = async (
    req: Request,
    res: Response<{ user: MeResponse }>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const token = bearerToken(req);
      if (!token) throw new UnauthorizedError('Please sign in.');
      const session = await this.service.getSession(token);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as RefreshDesktopSessionBody;
      const session = await this.service.refresh(body.refreshToken);
      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = (req.body ?? {}) as LogoutDesktopSessionBody;
      await this.service.logout({
        accessToken: bearerToken(req),
        refreshToken: body.refreshToken,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const desktopAuthController = new DesktopAuthController();
