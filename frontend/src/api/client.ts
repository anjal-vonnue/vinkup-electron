// src/api/client.ts
import axios from 'axios';
import { toApiError } from './errors';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Set on calls where a 401 is an expected answer (e.g. GET /auth/me). */
    skipUnauthorizedHandler?: boolean;
  }
}

export const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true, // send the login cookie
  timeout: 15000,
});

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered by AuthProvider so an expired session signs the user out without a page reload. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

// Runs on every failed request
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error);

    const skip = axios.isAxiosError(error) && error.config?.skipUnauthorizedHandler === true;

    // Session expired → back to the login page
    if (apiError.status === 401 && window.location.pathname !== '/login' && !skip) {
      unauthorizedHandler?.();
    }

    // A trainee tried to open another module during an active checkpoint.
    // The backend is the authority; bring them back to the running attempt.
    if (
      apiError.code === 'CHECKPOINT_ACTIVE' &&
      !window.location.pathname.startsWith('/checkpoints')
    ) {
      const details = apiError.details as { attemptId?: string } | undefined;
      window.location.assign(
        details?.attemptId ? `/checkpoints/attempts/${details.attemptId}` : '/checkpoints'
      );
    }

    return Promise.reject(apiError);
  }
);
