import request from 'supertest';
import { expect } from 'vitest';
import type { ApiErrorResponse, ErrorCode } from '@itp/types';
import app from '../../../app.js';

export type Res = request.Response;

/** Calls the API as a signed-in trainee (pass the cookie from createTrainee). */
export const api = {
  get: (url: string, cookie?: string) => withCookie(request(app).get(url), cookie),
  post: (url: string, body?: object, cookie?: string) =>
    withCookie(request(app).post(url), cookie).send(body),
  put: (url: string, body?: object, cookie?: string) =>
    withCookie(request(app).put(url), cookie).send(body),
  patch: (url: string, body?: object, cookie?: string) =>
    withCookie(request(app).patch(url), cookie).send(body),
};

function withCookie(req: request.Test, cookie?: string): request.Test {
  return cookie ? req.set('Cookie', cookie) : req;
}

/** The response body as the given type (supertest types it as `any`). */
export function body<T>(res: Res): T {
  return res.body as T;
}

/** Asserts the standard error shape: { error: { code, message } }. */
export function expectError(res: Res, status: number, code: ErrorCode): void {
  expect(res.status).toBe(status);
  const error = body<ApiErrorResponse>(res).error;
  expect(error.code).toBe(code);
  expect(typeof error.message).toBe('string');
  expect(error.message.length).toBeGreaterThan(0);
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function expectIsoDateTime(value: unknown): void {
  expect(value).toMatch(ISO_DATE_TIME);
}
