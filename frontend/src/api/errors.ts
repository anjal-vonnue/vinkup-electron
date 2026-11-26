import type { ApiErrorResponse, ErrorCode } from '@itp/types';

/** Every failed API call throws this. */
export class ApiError extends Error {
  status: number;
  code: ErrorCode | 'NETWORK_ERROR';
  details?: unknown;

  constructor(
    status: number,
    code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    details?: unknown
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Turns whatever axios threw into an ApiError. */
export function toApiError(error: unknown): ApiError {
  const axiosError = error as { response?: { status: number; data?: ApiErrorResponse } };

  // The server couldn't be reached at all
  if (!axiosError.response) {
    return new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check your connection.");
  }

  const { status, data } = axiosError.response;
  const code = data?.error?.code ?? 'INTERNAL_ERROR';
  const message = data?.error?.message ?? 'Something went wrong. Please try again.';

  return new ApiError(status, code, message, data?.error?.details);
}
