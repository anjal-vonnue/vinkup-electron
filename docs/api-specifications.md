# Vinkup API reference

REST/JSON API of Vinkup, the in-house trainee training platform (Express 5 backend in `backend/`). Written from the code on `main` as of 9 October 2026 (v0.2.0); when the code and this document disagree, the code wins.

## Base URLs

| Environment | Base URL                         | How it reaches the backend                                                                                                                                          |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production  | `https://vinkup.netlify.app/api` | Netlify rewrite `/api/*  https://vinkup-backend.onrender.com/api/:splat  200` (`frontend/public/_redirects:1`) proxies to the Render backend.                       |
| Local       | `http://localhost:5173/api`      | Vite dev server proxy `'/api': 'http://localhost:3000'` (`frontend/vite.config.ts`). Backend listens on `env.PORT`, default `3000` (`backend/src/config/env.ts:5`). |

All paths below include the `/api` prefix. The frontend axios client uses the relative base URL `/api` with `withCredentials: true` and a 15 s timeout (`frontend/src/api/client.ts`). Only the Google login redirect uses `VITE_API_URL` (`${VITE_API_URL}/api/auth/google`; `VITE_API_URL` is `""` locally and `https://vinkup.netlify.app` in production).

---

## Conventions

### Authentication

- **Mechanism:** a JWT in an HTTP cookie. Web routes have no `Authorization` header support; the desktop-only `/api/auth/desktop/session` and `/logout` use a Bearer access token instead.
- **Cookie name:** `auth_token` (`AUTH_COOKIE_NAME`, `auth.constants.ts:3`).
- **How it is set:** by `GET /api/auth/google/callback` after a web Google login, or by the Electron main process after a successful desktop exchange. The web JWT payload is `{ id, name, email, role }` of the trainee or mentor, signed with `JWT_SECRET`, `expiresIn: JWT_EXPIRES_IN` (env, default `'1h'`; set it to `7d` in production to match the cookie). The desktop cookie is a short-lived access JWT (`typ: "desktop"`; see the desktop section below).
- **requireAuth** (`middleware/authMiddleware.ts`): reads `req.cookies.auth_token`.
  - Missing cookie: `401 UNAUTHENTICATED`, message `"Not authenticated"`.
  - Invalid/expired JWT: `401 UNAUTHENTICATED`, message `"Invalid or expired token"`.
  - On success `req.user = { id, email, name, role }` from the token claims (no database lookup).
- **Roles:** `role` is `'trainee'` or `'admin'` (a mentor). Two guards build on `requireAuth` (`middleware/authMiddleware.ts`):
  - **requireTrainee:** signed in **and** `role === 'trainee'`. A mentor gets `403 FORBIDDEN` `"This page is for trainees."`.
  - **requireAdmin:** signed in **and** `role === 'admin'` **and** an `admin` row with that id and `is_active = true` still exists (checked on every request, so switching an admin off takes effect at once). Otherwise `403 FORBIDDEN` `"You don't have access to this."`.
- **Which routes require what** (`app.ts`):
  - Public: `GET /api/health`, `GET /api/auth/google`, `GET /api/auth/google/callback`, and the desktop transaction/google/callback/exchange/refresh endpoints (the desktop `session` and `logout` endpoints use a Bearer token).
  - Any signed-in user (`requireAuth` on the route, `auth.routes.ts`): `POST /api/auth/logout`, `GET /api/auth/me`.
  - Trainees only (`requireTrainee`): everything under `/api/profile`, `/api/activity`, `/api/dashboard`, `/api/courses`, `/api/tasks`, `/api/days`, `/api/journal`, `/api/typing-test` (at the mount), and `POST /api/activity/:taskId/events` (on the route, `flag.routes.ts`).
  - Mentors only (`requireAdmin`): everything under `/api/admin`.
  - Because the guards run at the mount, an **unknown path under those prefixes returns 401 (not 404) when the caller is unauthenticated**, and 403 for the wrong role.
- **Identity:** the trainee is always taken from the token (`req.user.id`), never from the body or URL. Mentor endpoints take the trainee from the URL (`:traineeId`) and are read-only, except `POST /api/admin/trainees`.
- **In this document,** "Auth: required" on a trainee endpoint means `requireTrainee`; mentor endpoints say "Auth: admin".
- **CORS:** `origin: env.FRONTEND_URL` (default `http://localhost:5173`), `credentials: true`.

### Request/response format

- JSON request bodies parsed by `express.json({ limit: '5mb' })` (`app.ts:29`). Bodies over 5 MB, and malformed JSON, are rejected with `400 VALIDATION_FAILED` (see errors).
- Responses are JSON except `204 No Content` responses (empty body).
- Field names in requests and responses are camelCase (the database is snake_case; services map it).
- Timestamps (`takenAt`, `submittedAt`, `updatedAt`) are ISO 8601 strings in UTC from `Date.toISOString()` (e.g. `"2026-10-04T05:12:33.120Z"`).

### Dates and time zone

- A platform "calendar day" is an **Asia/Kolkata (IST, UTC+05:30)** day (`utils/istDate.ts`).
- Date-only fields are `'YYYY-MM-DD'` strings of the IST calendar day (`activity_log.date` is a `@db.Date` column stored as midnight UTC of that date).
- Used by: `POST/GET /api/activity/time` (`date`), dashboard `today` and typing trend, profile `dailyActivity`.

### Error response shape

Every error is sent by `errorHandler` (`middleware/errorHandler.ts`) with this exact shape (`ApiErrorResponse`, `packages/types/src/common.ts`):

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields are invalid.",
    "details": []
  }
}
```

- `code`: one of the `ErrorCode` values below.
- `message`: safe to show to the trainee.
- `details`: present only when the error carries it (validation issues, checklist counts). Absent otherwise.
- Unknown (non-`AppError`) errors are logged server-side and returned as `500 INTERNAL_ERROR` with message `"Something went wrong. Please try again."` and no `details`.
- Unmatched routes: `404 NOT_FOUND`, message `"Route <METHOD> <originalUrl> not found."` (`notFoundHandler.ts`).

### Error codes

| Code                     | HTTP           | Raised by                                                                 | Meaning / default message                                                                                                                                                                                                                                                                                                   |
| ------------------------ | -------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`      | 400            | `ValidationError` (validate(), activity `days` query); body-parser errors | `"Some fields are invalid."`, `details` = Zod `issues` array. Body > 5 MB: `"The request is too large (5 MB max)."`. Malformed JSON: `"The request body is not valid JSON."`. Other client-side body-parser rejections (charset/encoding/aborted): `"The request could not be read."` (no `details` for body-parser cases). |
| `UNAUTHENTICATED`        | 401            | `UnauthorizedError`                                                       | Missing/invalid/expired cookie. Default message `"Please log in."`; requireAuth uses `"Not authenticated"` / `"Invalid or expired token"`. Also used internally in OAuth when Google returns no email (surfaces as a login redirect, not JSON).                                                                             |
| `FORBIDDEN`              | 403            | `ForbiddenError`                                                          | Wrong role (`requireTrainee`: `"This page is for trainees."`; `requireAdmin`: `"You don't have access to this."`), and a course certificate before the course is finished (`"Finish every day of this course to get its certificate."`).                                                                                    |
| `NOT_FOUND`              | 404            | `NotFoundError`                                                           | Unknown route, course, day, task, trainee or empty curriculum. Message varies (see each endpoint).                                                                                                                                                                                                                          |
| `DAY_LOCKED`             | 403            | `DayLockedError`                                                          | `"This day isn't unlocked yet."`                                                                                                                                                                                                                                                                                            |
| `CHECKLIST_INCOMPLETE`   | 403            | `ChecklistIncompleteError`                                                | `"Complete all required tasks before submitting the day."`, `details: { completedTasks: number, requiredTasks: number }`.                                                                                                                                                                                                   |
| `DOMAIN_NOT_PERMITTED`   | 403 (internal) | `DomainNotPermittedError`                                                 | `"This Google account is not on an approved domain."` Delivered as `?error=DOMAIN_NOT_PERMITTED` on the login redirect.                                                                                                                                                                                                     |
| `DOMAIN_NOT_PERMITTED`   | 400            | `TraineeDomainError`                                                      | `POST /api/admin/trainees` only: `"Use a company email address ending in @<ALLOWED_EMAIL_DOMAIN>."`                                                                                                                                                                                                                         |
| `TRAINEE_EXISTS`         | 409            | `ConflictError`                                                           | `POST /api/admin/trainees`: `"A trainee with this email already exists."` (also when two requests race for the same email).                                                                                                                                                                                                 |
| `EMAIL_BELONGS_TO_ADMIN` | 409            | `ConflictError`                                                           | `POST /api/admin/trainees`: `"This email belongs to a mentor account."`                                                                                                                                                                                                                                                     |
| `NOT_PROVISIONED`        | 403 (internal) | `NotProvisionedError`                                                     | `"Your account has not been provisioned yet. Contact your administrator."` Only delivered as `?error=NOT_PROVISIONED` on the login redirect.                                                                                                                                                                                |
| `INTERNAL_ERROR`         | 500            | errorHandler fallback                                                     | Any unexpected error.                                                                                                                                                                                                                                                                                                       |

The frontend additionally uses a client-only `NETWORK_ERROR` (status 0) when the server is unreachable (`frontend/src/api/errors.ts`); the backend never sends it.

### Validation behaviour (`middleware/validate.ts`)

`validate({ params?, body? })` runs before the controller:

1. If `params` schema given: `safeParse(req.params)`; on failure `next(new ValidationError(issues))` → `400 VALIDATION_FAILED`. **`req.params` is not replaced** (controllers read the original strings).
2. If `body` schema given: `safeParse(req.body)`; on failure → 400. On success **`req.body` is replaced with the parsed data**: unknown keys are stripped (Zod objects strip by default), `.trim()` and `.transform()` results are applied (e.g. journal text is trimmed; activity `date` becomes a `Date`).
3. Params are checked before body, so a bad param wins.
4. `validate()` does not support query strings; the only query (`GET /api/activity/time?days=`) is parsed in the controller with the same 400 result.

`details` is the Zod v4 `issues` array, e.g.:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields are invalid.",
    "details": [
      {
        "origin": "string",
        "code": "too_small",
        "minimum": 1,
        "inclusive": true,
        "path": ["responseText"],
        "message": "Too small: expected string to have >=1 characters"
      }
    ]
  }
}
```

(Issue fields/messages are generated by Zod; custom messages are listed per endpoint.)

### Day locking (shared rule)

Days are ordered across the whole curriculum by course `sort_order`, then `day_number` (courses seeded: `html`, `css`, `js`, `ts`, `node`, `postgresql`, `prisma`, `react`). There is no unlock table.

One rule, `ProgressService.isDayUnlocked()` (`progress-module/progress.service.ts`), decides for every endpoint (day pages, journal, tasks, flag events, integrity, dashboard, course days, profile and the mentor views): a day is `COMPLETED` if this trainee completed it; otherwise it is `UNLOCKED` if it is the first day of the curriculum or the immediately preceding day is completed; every other day is `LOCKED`. `day-module/day-access.services.ts` only calls this rule. Unknown day → 404 first, then locked → `403 DAY_LOCKED`. (Before v0.2.0 two slightly different rules existed.)

---

## Endpoint summary

| Method | Path                                                | Auth    | Purpose                                                                             |
| ------ | --------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/health`                                       | No      | Liveness check                                                                      |
| GET    | `/api/auth/google`                                  | No      | Start Google OAuth (redirect)                                                       |
| GET    | `/api/auth/google/callback`                         | No      | OAuth callback; sets `auth_token` cookie and redirects                              |
| POST   | `/api/auth/logout`                                  | Any     | Clear the auth cookie                                                               |
| GET    | `/api/auth/me`                                      | Any     | Current user (trainee or mentor) and role from the token                            |
| GET    | `/api/dashboard`                                    | Trainee | Dashboard: next day, progress counts, time totals, typing summary, finished courses |
| GET    | `/api/courses/:courseId/days`                       | Trainee | Days of one course with this trainee's status                                       |
| GET    | `/api/courses/:courseId/certificate`                | Trainee | Certificate for a finished course                                                   |
| GET    | `/api/days/:dayId`                                  | Trainee | Day lesson content (readable even when locked)                                      |
| GET    | `/api/days/:dayId/status`                           | Trainee | Lock/completion state of a day                                                      |
| PATCH  | `/api/days/:dayId/complete`                         | Trainee | Complete a day; returns status and next day id                                      |
| PATCH  | `/api/days/:dayId/status`                           | Trainee | Legacy alias of complete; returns status only                                       |
| GET    | `/api/days/:dayId/journal`                          | Trainee | Trainee's journal response for a day                                                |
| PUT    | `/api/days/:dayId/journal`                          | Trainee | Create/replace journal response                                                     |
| GET    | `/api/days/:dayId/tasks`                            | Trainee | Task list of a day with per-trainee status                                          |
| GET    | `/api/days/:dayId/integrity`                        | Trainee | The day's integrity score (0–100) from its focus events                             |
| GET    | `/api/tasks/:taskId`                                | Trainee | Task details                                                                        |
| GET    | `/api/tasks/:taskId/code`                           | Trainee | Saved files, or starter files                                                       |
| PUT    | `/api/tasks/:taskId/code`                           | Trainee | Replace the saved file set                                                          |
| POST   | `/api/tasks/:taskId/submit`                         | Trainee | Mark task completed (repeatable)                                                    |
| POST   | `/api/activity/time`                                | Trainee | Add active/coding seconds to a day                                                  |
| GET    | `/api/activity/time`                                | Trainee | Per-day activity for the last N days                                                |
| POST   | `/api/activity/:taskId/events`                      | Trainee | Log an integrity flag event for a task                                              |
| POST   | `/api/typing-test/results`                          | Trainee | Save a typing test result                                                           |
| GET    | `/api/typing-test/results`                          | Trainee | All typing results, newest first                                                    |
| GET    | `/api/profile`                                      | Trainee | Profile page data                                                                   |
| GET    | `/api/journal`                                      | Trainee | Accessible journal entries, newest curriculum day first                             |
| GET    | `/api/admin/trainees`                               | Admin   | Every trainee with progress, time, typing, flags and integrity                      |
| POST   | `/api/admin/trainees`                               | Admin   | Add a trainee                                                                       |
| GET    | `/api/admin/trainees/:traineeId`                    | Admin   | One trainee: profile, course progress, worked-on tasks, journal                     |
| GET    | `/api/admin/trainees/:traineeId/flags`              | Admin   | The trainee's flag events, newest first                                             |
| GET    | `/api/admin/trainees/:traineeId/tasks/:taskId/code` | Admin   | The trainee's saved files for a task (read-only)                                    |

32 endpoints (including the legacy `PATCH /api/days/:dayId/status`). "Any" = any signed-in user (`requireAuth`); "Trainee" = `requireTrainee`; "Admin" = `requireAdmin`.

---

## Health

### GET /api/health

- **Auth:** none.
- **Response 200:**

```json
{ "status": "ok" }
```

---

## Auth

Google OAuth 2.0 via `passport-google-oauth20`, `session: false`, scope `['profile', 'email']`. Callback URL is `env.GOOGLE_CALLBACK_URL`. In production it must be `https://vinkup.netlify.app/api/auth/google/callback` (through the Netlify proxy), so the cookie is set for the site's own domain and sent with later `/api` calls; the same URL must be registered in the Google Cloud OAuth client.

### GET /api/auth/google

- **Auth:** none.
- **Behaviour:** 302 redirect to Google's consent screen. The frontend navigates the window here (`startGoogleLogin()`), it is not an XHR call.

### GET /api/auth/google/callback

- **Auth:** none. Called by Google with `?code=...`.
- **Verification** (`auth.service.ts`, `passport.ts`):
  1. Email = first Google profile email. None → `UNAUTHENTICATED` (`"Google did not return an email address."`).
  2. Email must end with `@${ALLOWED_EMAIL_DOMAIN}` (case-sensitive string match) → else `DOMAIN_NOT_PERMITTED`.
  3. An **active** `admin` row with that email (lower-cased) → signs in as `role: 'admin'` and sets `admin.last_login_at`. Mentors are checked first, so an email in both lists signs in as a mentor.
  4. Otherwise a `trainee` row with exactly that email must exist (no self-registration) → `role: 'trainee'`; else `NOT_PROVISIONED`.
- **Success:** sets cookie `auth_token` (options above, `maxAge` 7 days) and **302 redirects to `${FRONTEND_URL}/admin`** for a mentor or **`${FRONTEND_URL}`** (no path) for a trainee.
- **Rejected login:** **302 redirect to `${FRONTEND_URL}/login?error=<CODE>&email=<email>`** where `<CODE>` is the `AppError` code (`DOMAIN_NOT_PERMITTED`, `NOT_PROVISIONED`, or `UNAUTHENTICATED`), or `LOGIN_FAILED` when passport fails without a message; `email` is the Google email or `""`. If the user cancels on Google's screen, passport fails with Google's `error_description` as the message (check: the value placed in `error` is then not one of the codes above).
- **Unexpected errors** (e.g. database down, token exchange failure): passed to `errorHandler` → `500 INTERNAL_ERROR` JSON, not a redirect (check for token-exchange failures).

### POST /api/auth/logout

- **Auth:** required (`requireAuth`). An expired/missing token gets 401 and the cookie is **not** cleared.
- **Request body:** none.
- **Behaviour:** `res.clearCookie('auth_token', { httpOnly, secure, sameSite, path: '/' })` (same flags as login, no `maxAge`). Stateless: the JWT itself is not revoked.
- **Response 200:**

```json
{ "message": "Logged out" }
```

- **Errors:** 401 `UNAUTHENTICATED`.

### GET /api/auth/me

- **Auth:** required.
- **Response 200** (`MeResponse`), taken from the JWT claims, not the database. `role` is `"trainee"` or `"admin"`; the frontend routes on it.

```json
{
  "id": "8f2c1d4e-6a3b-4c1e-9f7a-2b5d8e0c1a33",
  "email": "asha.k@vonnue.com",
  "name": "Asha K",
  "role": "trainee"
}
```

- **Errors:** 401 `UNAUTHENTICATED`. The frontend calls this with `skipUnauthorizedHandler: true` (401 is an expected "not logged in" answer).

### Desktop (Electron) sign-in

The desktop app uses a separate flow under `/api/auth/desktop`. It shares the same Google **Web** OAuth client but uses a second callback URL, `GOOGLE_DESKTOP_CALLBACK_URL` (default: `<GOOGLE_CALLBACK_URL host>/api/auth/desktop/callback`). The browser leg ends with a one-time handoff code on `127.0.0.1`; tokens are only released to the Electron main process after PKCE verification. The full flow and security model are in [authentication.md](authentication.md).

| Method | Path                             | Auth          | Purpose                                                                                                                                                        |
| ------ | -------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/desktop/transactions` | none          | Create a 5-minute transaction; body `{ redirectUri, codeChallenge, codeChallengeMethod: "S256" }`; 201 `{ transactionId, state, authorizationUrl, expiresAt }` |
| GET    | `/api/auth/desktop/google`       | none          | Browser entry point: `?transaction=<uuid>` starts Google (`prompt=select_account`)                                                                             |
| GET    | `/api/auth/desktop/callback`     | none          | Google redirect; verifies `state`, binds the user, 302s to the loopback with `?code&state` or `?error&state`                                                   |
| POST   | `/api/auth/desktop/exchange`     | none          | Body `{ code, codeVerifier }`; verifies PKCE, consumes the code once, returns `DesktopAuthSessionResponse`                                                     |
| GET    | `/api/auth/desktop/session`      | Bearer        | Returns `{ user }` for a desktop access token; a web cookie is not accepted                                                                                    |
| POST   | `/api/auth/desktop/refresh`      | none          | Body `{ refreshToken }`; rotates the token and returns a new session                                                                                           |
| POST   | `/api/auth/desktop/logout`       | Bearer + body | Revokes by access token and/or `{ refreshToken }`; always 204                                                                                                  |

`DesktopAuthSessionResponse` is `{ accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, user }`. Access tokens are JWTs (`typ: "desktop"`, `sid`) with a `DESKTOP_ACCESS_TOKEN_TTL` lifetime (default `15m`); refresh tokens are opaque, stored hashed, rotate on every use, and slide for 30 days.

Desktop error codes: `DESKTOP_AUTH_INVALID_STATE`, `DESKTOP_AUTH_INVALID_PKCE`, `DESKTOP_AUTH_INVALID_CODE`, `DESKTOP_AUTH_EXPIRED`, `DESKTOP_AUTH_CODE_USED`, `DESKTOP_AUTH_FAILED`, `DESKTOP_AUTH_CANCELLED`, `DESKTOP_SESSION_EXPIRED`, `DESKTOP_SESSION_REVOKED` (plus `DOMAIN_NOT_PERMITTED` / `NOT_PROVISIONED` for rejected accounts). The renderer maps these to its own smaller `DesktopAuthErrorCode` set.

---

## Dashboard & courses

### GET /api/dashboard

- **Auth:** required.
- **Response 200** (`DashboardResponse`):

```json
{
  "nextDay": {
    "id": "css-day-01",
    "courseId": "css",
    "dayNumber": 1,
    "title": "Selectors, Box Model, Colours & Typography",
    "description": "Build a reusable CSS design system.",
    "status": "UNLOCKED",
    "courseTotalDays": 5
  },
  "totalDaysCompleteOverall": 5,
  "totalDaysOverall": 54,
  "today": { "activeSeconds": 2460, "codingSeconds": 1380 },
  "total": { "activeSeconds": 61200, "codingSeconds": 30400 },
  "typing": {
    "latest": {
      "wpm": 52,
      "accuracy": 96.4,
      "takenAt": "2026-10-04T05:12:33.120Z"
    },
    "todayAverageWpm": 50,
    "trend": [
      { "date": "2026-10-02", "averageWpm": 47 },
      { "date": "2026-10-04", "averageWpm": 50 }
    ]
  },
  "completedCourseIds": ["html"]
}
```

- **Field rules** (`dashboard.service.ts`, `dashboard.typing.ts`):
  - `nextDay`: the `UNLOCKED` day (day locking rule) with `courseTotalDays` = number of days in its course; `null` when every day is completed. `description` is `curriculum_day.subtitle`; `status` is always `"UNLOCKED"`.
  - `totalDaysCompleteOverall` / `totalDaysOverall`: counts across all courses.
  - `today`: the `activity_log` row for today's IST date, zeros if none. `total`: sum of all rows, zeros if none. `activeSeconds` includes `codingSeconds`.
  - `typing.latest`: most recent result or `null`. `typing.todayAverageWpm`: rounded mean WPM of today's (IST) results, or `null`. `typing.trend`: one entry per IST date that has results, within the last 30 IST days (today included), oldest first, `averageWpm` rounded. Days without results are omitted.
  - `completedCourseIds`: ids of the courses in which this trainee has completed **every** day (`certificate.service.ts`, `summarizeCompletions`), in no particular order. The frontend shows a certificate badge on those course tabs.
- **Errors:** 401; 403 `FORBIDDEN` (mentor); 404 `NOT_FOUND` `"Day not found."` (only if the unlocked day vanishes mid-request).

### GET /api/courses/:courseId/days

- **Auth:** required.
- **Path params:** `courseId`: string, 1–50 chars, regex `^[a-z0-9-]+$` (e.g. `html`, `js`, `postgresql`).
- **Response 200** (`CourseDaysResponse` = `DaySummary[]`), days ordered by `dayNumber` ascending:

```json
[
  {
    "id": "html-day-01",
    "courseId": "html",
    "dayNumber": 1,
    "title": "…",
    "description": "…",
    "status": "COMPLETED"
  },
  {
    "id": "html-day-02",
    "courseId": "html",
    "dayNumber": 2,
    "title": "…",
    "description": "…",
    "status": "UNLOCKED"
  },
  {
    "id": "html-day-03",
    "courseId": "html",
    "dayNumber": 3,
    "title": "…",
    "description": "…",
    "status": "LOCKED"
  }
]
```

`status` ∈ `LOCKED | UNLOCKED | COMPLETED` (progress rule). `description` = day subtitle.

- **Errors:** 400 `VALIDATION_FAILED` (bad `courseId`); 401; 404 `NOT_FOUND` `"Course not found."`.

### GET /api/courses/:courseId/certificate

- **Auth:** required.
- **Path params:** `courseId`: same rules as above.
- **Business rules** (`certificate.service.ts`):
  1. Unknown course → `404 "Course not found."`.
  2. A course is finished when the trainee has a `day_completion` row for **every** day of it. Not finished → `403 FORBIDDEN` `"Finish every day of this course to get its certificate."`.
  3. `completedAt` = the latest `completed_at` among the course's days. `certificateId` = `"VK-"` + the first 10 hex characters, upper-cased, of SHA-256 of `"<traineeId>:<courseId>"`: stable for the same trainee and course, and different for everyone else.
- **Response 200** (`CourseCertificate`):

```json
{
  "courseId": "html",
  "courseTitle": "HTML",
  "traineeName": "Asha K",
  "daysCompleted": 5,
  "completedAt": "2026-10-01T12:40:11.204Z",
  "certificateId": "VK-3F9A2C71B0"
}
```

- **Errors:** 400; 401; 403 `FORBIDDEN` (not finished, or a mentor); 404 `"Course not found."` / `"Trainee not found."`.

---

## Days

All day routes: `dayId` path param is a string of 1–100 chars (no format check; ids look like `css-day-01`). Days are seeded by id; lock checks use the day-access rule.

### GET /api/days/:dayId

- **Auth:** required (but the response does not depend on the trainee).
- **Business rule:** **no lock check**; locked days' content is readable so outlines can preview upcoming lessons.
- **Response 200** (`DayContent`):

```json
{
  "dayId": "css-day-01",
  "courseSlug": "css",
  "courseTitle": "CSS",
  "dayNumber": 1,
  "totalDays": 5,
  "title": "Selectors, Box Model, Colours & Typography",
  "subtitle": "Build a reusable CSS design system.",
  "lessonSummary": "Create a design system with CSS variables, typography, colours, and box model rules, then apply it to the home page.",
  "learningObjectives": [
    {
      "id": "css-day-01-obj-1",
      "code": "1.1",
      "title": "CSS Selectors",
      "description": "Understand selectors, specificity, and cascade."
    }
  ],
  "selfCheckItems": [
    {
      "id": "css-day-01-check-1",
      "code": "1.1",
      "label": "Specificity",
      "description": "Predict the winning rule in a specificity conflict.",
      "isRequired": true
    }
  ],
  "journalPrompt": "Why is box-sizing: border-box almost always the better choice? When would you not use it?"
}
```

`learningObjectives` and `selfCheckItems` are ordered by their `sort_order`. `courseSlug` is the course id. `totalDays` = days in the course.

- **Errors:** 400 (bad `dayId`); 401; 404 `NOT_FOUND` `"Day not found"`.

### GET /api/days/:dayId/status

- **Auth:** required.
- **Response 200** (`DayCurrentStatus`). Does not reject locked days:

```json
{ "isLocked": false, "isCompleted": false }
```

Completed → `{ "isLocked": false, "isCompleted": true }`. First curriculum day → never locked. Otherwise `isLocked` = previous day not completed.

- **Errors:** 400; 401; 404 `"Day not found"`.

### PATCH /api/days/:dayId/complete

- **Auth:** required.
- **Request body:** none (ignored).
- **Business rules** (`day.services.ts:38-51`):
  1. Unknown day → 404. Locked day → `403 DAY_LOCKED`.
  2. If not already completed: count **required tasks** = tasks of the day with `is_stretch_goal = false`; **completed** = this trainee's `task_progress` rows with `status = 'completed'` for those tasks (set by `POST /tasks/:taskId/submit`). If completed < required → `403 CHECKLIST_INCOMPLETE` with `details: { completedTasks, requiredTasks }`. Stretch goals, self-check items and the journal are **not** required. A day with zero required tasks can be completed immediately.
  3. Upserts `day_completion` (idempotent; calling again on a completed day succeeds without re-checking tasks) and finds the next day in curriculum order (next `day_number` in the same course, else the first day of the next course by `sort_order`), in one transaction.
- **Response 200** (`CompleteDayResponse`):

```json
{
  "status": { "isLocked": false, "isCompleted": true },
  "nextDayId": "css-day-02"
}
```

`nextDayId` is `null` after the last day of the curriculum.

- **Errors:** 400; 401; 403 `DAY_LOCKED`; 403 `CHECKLIST_INCOMPLETE`:

```json
{
  "error": {
    "code": "CHECKLIST_INCOMPLETE",
    "message": "Complete all required tasks before submitting the day.",
    "details": { "completedTasks": 3, "requiredTasks": 6 }
  }
}
```

404 `"Day not found"`.

### PATCH /api/days/:dayId/status (legacy)

- Same rules and errors as `PATCH /api/days/:dayId/complete`, but the **response 200 is only the `DayCurrentStatus`**:

```json
{ "isLocked": false, "isCompleted": true }
```

Kept "for the existing day overview client" (`day.routes.ts:25`); the current frontend calls `/complete`.

### GET /api/days/:dayId/journal

- **Auth:** required.
- **Business rule:** day must be accessible (day-access rule).
- **Response 200** (`DayJournal`). No saved entry is not an error:

```json
{ "responseText": null }
```

or `{ "responseText": "Because padding and border stay inside the declared width…" }`.

- **Errors:** 400; 401; 403 `DAY_LOCKED`; 404 `"Day not found"`.

### PUT /api/days/:dayId/journal

- **Auth:** required.
- **Request body** (`SaveJournalRequest`):

| Field          | Type   | Rules                                                                                                                                                                                                             |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `responseText` | string | Trimmed first, then 1–5,000 chars (`MAX_JOURNAL_LENGTH = 5_000`). Whitespace-only is rejected. Stored trimmed. Note: the frontend text box allows 10,000, so an entry over 5,000 characters is rejected with 400. |

```json
{ "responseText": "Because padding and border stay inside the declared width…" }
```

- **Business rules:** day must be accessible; upsert, one entry per trainee per day (create first time, replace after). Allowed on completed days.
- **Response 200** (`DayJournal`), the saved (trimmed) text:

```json
{ "responseText": "Because padding and border stay inside the declared width…" }
```

- **Errors:** 400 `VALIDATION_FAILED` (bad `dayId`, missing/empty/too-long `responseText`); 401; 403 `DAY_LOCKED`; 404 `"Day not found"`.

### GET /api/journal

- **Auth:** required.
- **Response 200** (`JournalListResponse`): `{ "entries": [...] }`, with accessible days only (completed days and the next unlocked day), newest curriculum day first. Each entry includes the curriculum title, track label, journal prompt, saved text and update time. `isEditable` is true only for the next unlocked day.

### GET /api/days/:dayId/tasks

- **Auth:** required.
- **Business rule:** day must be accessible (day-access rule).
- **Response 200** (`DayTask[]`), ordered by `sequenceOrder` ascending:

```json
[
  {
    "id": "css-day-01-t-1",
    "sequenceOrder": 1,
    "title": "Selector Challenge Sheet",
    "status": "completed",
    "isStretchGoal": false
  },
  {
    "id": "css-day-01-t-2",
    "sequenceOrder": 2,
    "title": "…",
    "status": "not_started",
    "isStretchGoal": false
  }
]
```

`status` ∈ `not_started | in_progress | completed`, taken directly from the `task_progress.status` column; no row → `not_started`.

- **Errors:** 400; 401; 403 `DAY_LOCKED`; 404 `"Day not found"`.

### GET /api/days/:dayId/integrity

- **Auth:** required.
- **Path params:** `dayId`: string, 1–100 chars.
- **Business rules** (`integrity.service.ts`, pure scoring in `integrity.scoring.ts`):
  1. Unknown day → 404; locked day → `403 DAY_LOCKED`.
  2. The tasks that count are this day's tasks the trainee **worked on**: a `task_progress` row (saved code) **or** at least one flag event. Submission is not required.
  3. **Task score** = 100 minus the penalties of that task's flag events, never below 0. Penalty per event, before the priority multiplier:

| Event             | Penalty                                                            | Cap                    |
| ----------------- | ------------------------------------------------------------------ | ---------------------- |
| `PASTE_BLOCKED`   | 10                                                                 | first 5 per task count |
| `TAB_SWITCH`      | 0 if `durationMs` < 10,000; else 3 + 1 per full minute (extra ≤ 6) | 9 per event            |
| `FULLSCREEN_EXIT` | 4 + 1 per full minute (extra ≤ 7); always counts                   | 11 per event           |
| `WINDOW_BLUR`     | 0 if `durationMs` < 10,000; else 1                                 | first 2 per task count |

     Each penalty is multiplied by the event's `review_priority`: `LOW` ×1, `NORMAL` ×1.5, `HIGH` ×2. A missing `durationMs` counts as 0 extra minutes and isn't "short".

4. **Day score** = the average of the task scores, rounded and clamped to 0–100; `null` when no task of the day was worked on.

- **Response 200** (`DayIntegrityResponse`):

```json
{ "score": 92 }
```

- **Errors:** 400; 401; 403 `DAY_LOCKED`; 404 `"Day not found."`.

---

## Tasks

All task routes: `taskId` path param is a string, 1–100 chars, regex `^[a-z0-9-]+$` (e.g. `css-day-01-t-1`). Each handler first checks the task exists (`404 "Task not found."`) and its day is not `LOCKED` under the **progress** rule (`403 DAY_LOCKED`).

### GET /api/tasks/:taskId

- **Auth:** required.
- **Response 200** (`TaskResponse`):

```json
{
  "id": "css-day-01-t-1",
  "title": "Selector Challenge Sheet",
  "instructionsMarkdown": "**CSS · Day 1: Selectors, Box Model, Colours & Typography** · Task 1 of 8 · about 40 min\n\n…",
  "isStretchGoal": false,
  "sequenceOrder": 1,
  "estimatedMinutes": 40,
  "status": "in_progress",
  "day": { "id": "css-day-01", "dayNumber": 1, "courseTitle": "CSS" },
  "runtime": "browser",
  "runCommand": null,
  "setupSql": null
}
```

- **Field rules:**
  - `estimatedMinutes`: number or `null`.
  - `runtime` ∈ `browser | node | sql`. `runCommand`: the run command of a `node` task (`"npm run check"`, `"npm test"` or `"npm run dev"` in the current curriculum), otherwise `null`; the 16 Prisma tasks have none. `setupSql`: SQL string for `sql` tasks or `null`.
  - `status` is derived (`progressService.taskStatus`): no progress row → `not_started`; row `status = 'completed'` → `completed`; row with `code_updated_at` set or non-null `files` → `in_progress`; otherwise `not_started`.
- **Errors:** 400; 401; 403 `DAY_LOCKED`; 404 `"Task not found."`.

### GET /api/tasks/:taskId/code

- **Auth:** required.
- **Response 200** (`TaskCodeResponse`):
  - If the trainee has saved files: those files and `updatedAt` = ISO time of the last save (or `null` if the row has files but no save time).
  - Otherwise: the task's starter files and `updatedAt: null`.

```json
{
  "files": [
    { "path": "index.html", "content": "<!doctype html>\n<html>…</html>" },
    { "path": "styles/main.css", "content": ":root { … }" }
  ],
  "updatedAt": "2026-10-04T06:01:12.441Z"
}
```

Malformed entries in the stored JSON (not `{ path: string, content: string }`) are silently dropped (`task.files.ts`).

- **Errors:** 400; 401; 403 `DAY_LOCKED`; 404 `"Task not found."`.

### PUT /api/tasks/:taskId/code

- **Auth:** required.
- **Request body** (`SaveCodeRequest`), the **complete** file set (a file left out is deleted):

| Field             | Type   | Rules                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `files`           | array  | At most 200 items (`MAX_FILES_PER_TASK`). Paths must be unique (`"Two files have the same path."`). Empty array allowed.                                                                                                                                                                                                      |
| `files[].path`    | string | 1–200 chars (`MAX_PATH_CHARS`). No `\` (`"Use / to separate folders."`). Split on `/`, no segment may be `''`, `.` or `..` (so no leading/trailing/double slash) (`'Use a relative path with no empty, "." or ".." folders.'`). No NUL and no lone UTF-16 surrogate (`"The path contains characters that cannot be saved."`). |
| `files[].content` | string | At most 200,000 chars (`MAX_FILE_CHARS`); may be empty. No NUL / lone surrogate (`"The file contains characters that cannot be saved."`).                                                                                                                                                                                     |

The whole request is also capped by the 5 MB JSON body limit, which is reached long before 200 files × 200,000 chars.

```json
{
  "files": [
    { "path": "index.html", "content": "<!doctype html>…" },
    { "path": "styles/main.css", "content": ":root { --brand: #0a6; }" }
  ]
}
```

- **Business rules:** upsert of `task_progress`: a new row is created with `status: 'in_progress'`; an existing row keeps its status (a completed task stays completed when edited). Sets `code_updated_at` to now.
- **Response:** `204 No Content`.
- **Errors:** 400 `VALIDATION_FAILED` (schema or body > 5 MB); 401; 403 `DAY_LOCKED`; 404 `"Task not found."`.

### POST /api/tasks/:taskId/submit

- **Auth:** required.
- **Request body:** none.
- **Business rules:** repeatable ("Resubmit"); never locks editing and never completes the day. Upserts `task_progress` with `status: 'completed'` and `last_submitted_at = now`; `first_submitted_at` is set only on the first submit (same transaction). No code is required to submit.
- **Response 200** (`SubmitTaskResponse`):

```json
{ "status": "completed", "submittedAt": "2026-10-04T06:15:40.002Z" }
```

- **Errors:** 400; 401; 403 `DAY_LOCKED`; 404 `"Task not found."`.

---

## Activity time

### POST /api/activity/time

- **Auth:** required (mount-level).
- **Request body** (`ActivityTimeRequest`):

| Field           | Type    | Rules                                                                                                                            |
| --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `date`          | string  | Required. Zod ISO date `YYYY-MM-DD`; must be `<=` today's Asia/Kolkata date (`"date cannot be in the future."`). No lower bound. |
| `activeSeconds` | integer | 0–600 (`MAX_BATCH_SECONDS`).                                                                                                     |
| `codingSeconds` | integer | 0–600, and `<= activeSeconds` (`"codingSeconds cannot be greater than activeSeconds."`, path `codingSeconds`).                   |

```json
{ "date": "2026-10-04", "activeSeconds": 60, "codingSeconds": 42 }
```

- **Business rules:** upsert of `activity_log` keyed by (trainee, date): creates the row, or **increments** both counters. Not idempotent: each call adds. The frontend sends a batch about every 60 s and on tab hide (a `fetch` with `keepalive`), with `date` = its own IST date.
- **Response:** `204 No Content`.
- **Errors:** 400 `VALIDATION_FAILED`; 401.

### GET /api/activity/time

- **Auth:** required.
- **Query params:** `days`: coerced integer 1–365, default 7. Invalid → `400 VALIDATION_FAILED` (parsed in the controller).
- **Response 200** (`ActivityTimeDay[]`): the last `days` IST calendar days including today, **newest first**, only days with `activeSeconds > 0` (days without activity are omitted):

```json
[
  { "date": "2026-10-04", "activeSeconds": 2460, "codingSeconds": 1380 },
  { "date": "2026-10-02", "activeSeconds": 5400, "codingSeconds": 3100 }
]
```

- **Errors:** 400; 401.

---

## Flag events

### POST /api/activity/:taskId/events

- **Auth:** required (route-level `requireTrainee`).
- **Path params:** `taskId`: string, 1–100 chars (no regex here, unlike `/api/tasks`).
- **Request body** (`LogFlagEventRequest`):

| Field        | Type    | Rules                                                                                                                                        |
| ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | enum    | `FULLSCREEN_EXIT` \| `TAB_SWITCH` \| `PASTE_BLOCKED` \| `WINDOW_BLUR`                                                                        |
| `durationMs` | integer | Optional, `>= 0`.                                                                                                                            |
| `context`    | object  | Optional. Keys: strings ≤ 50 chars; values: string ≤ 200 chars, number, or boolean; at most 10 keys (`"context can have at most 10 keys."`). |

```json
{
  "type": "TAB_SWITCH",
  "durationMs": 12000,
  "context": { "source": "terminal" }
}
```

- **Business rules** (`flag.service.ts`):
  1. Task must exist → else `404 "Task not found."`; its day must not be `LOCKED` (progress rule) → else `403 DAY_LOCKED`.
  2. Server sets the timestamp.
  3. **De-duplication:** if the same trainee + task + type was logged within the last 2000 ms, nothing is stored (still 204).
  4. `review_priority` is computed server-side: `PASTE_BLOCKED` → `LOW`; `TAB_SWITCH`, `FULLSCREEN_EXIT`, `WINDOW_BLUR` → `LOW` if `durationMs` < 5,000 (missing counts as 0), `NORMAL` if < 30,000, else `HIGH`.
- **Response:** `204 No Content`.
- **Errors:** 400; 401; 403 `DAY_LOCKED`; 404 `"Task not found."`.

---

## Typing test

### POST /api/typing-test/results

- **Auth:** required.
- **Request body** (`SaveTypingResultRequest`):

| Field      | Type    | Rules                                      |
| ---------- | ------- | ------------------------------------------ |
| `wpm`      | integer | 0–300                                      |
| `accuracy` | number  | 0–100; rounded to 1 decimal before storing |

```json
{ "wpm": 52, "accuracy": 96.37 }
```

- **Business rules:** server sets `takenAt`. Every call creates a new row.
- **Response 201** (`TypingResultRecord`):

```json
{
  "id": "3c9a7b52-0f1e-4d7a-b8a1-5e2f6c4d9e10",
  "wpm": 52,
  "accuracy": 96.4,
  "takenAt": "2026-10-04T05:12:33.120Z"
}
```

- **Errors:** 400; 401.

### GET /api/typing-test/results

- **Auth:** required.
- **Response 200** (`TypingResultRecord[]`): **all** of the trainee's results (no pagination), ordered by `takenAt` desc then `id` desc. `accuracy` rounded to 1 decimal.

```json
[
  {
    "id": "3c9a7b52-0f1e-4d7a-b8a1-5e2f6c4d9e10",
    "wpm": 52,
    "accuracy": 96.4,
    "takenAt": "2026-10-04T05:12:33.120Z"
  },
  {
    "id": "a1d0e8f4-7b2c-4e55-9c13-0d6f2a7b8c91",
    "wpm": 47,
    "accuracy": 94,
    "takenAt": "2026-10-02T11:40:05.871Z"
  }
]
```

- **Errors:** 401.

---

## Profile

### GET /api/profile

- **Auth:** required.
- **Response 200** (`ProfileData`):

```json
{
  "trainee": {
    "name": "Asha K",
    "email": "asha.k@vonnue.com",
    "track": "CSS",
    "currentDay": 1,
    "totalDays": 5
  },
  "total": { "activeSeconds": 61200, "codingSeconds": 30400 },
  "typing": { "latestWpm": 52, "latestAccuracy": 96.4 },
  "dailyActivity": [
    {
      "date": "2026-10-04",
      "timeSpentSeconds": 2460,
      "typingWpm": 50,
      "isToday": true
    },
    {
      "date": "2026-10-03",
      "timeSpentSeconds": 0,
      "typingWpm": null,
      "isToday": false
    },
    {
      "date": "2026-10-02",
      "timeSpentSeconds": 5400,
      "typingWpm": 47,
      "isToday": false
    },
    {
      "date": "2026-10-01",
      "timeSpentSeconds": 3600,
      "typingWpm": null,
      "isToday": false
    },
    {
      "date": "2026-09-30",
      "timeSpentSeconds": 0,
      "typingWpm": null,
      "isToday": false
    },
    {
      "date": "2026-09-29",
      "timeSpentSeconds": 1800,
      "typingWpm": null,
      "isToday": false
    },
    {
      "date": "2026-09-28",
      "timeSpentSeconds": 0,
      "typingWpm": null,
      "isToday": false
    }
  ]
}
```

---

## Admin (mentor)

All routes are under `/api/admin`, mounted behind `requireAdmin` (`app.ts`): a trainee gets `403 FORBIDDEN`, and so does a mentor whose `admin` row has been switched off. Mentors read any trainee's data but change nothing, except adding a trainee. `traineeId` path params must be UUIDs (`admin.schema.ts`), otherwise `400 VALIDATION_FAILED`. Code: `module/admin-module/`.

### GET /api/admin/trainees

- **Auth:** admin.
- **Response 200** (`AdminTraineeSummary[]`), one row per trainee, ordered by name. Built with a fixed number of queries however many trainees there are.

```json
[
  {
    "id": "8f2c1d4e-6a3b-4c1e-9f7a-2b5d8e0c1a33",
    "name": "Asha K",
    "email": "asha.k@vonnue.com",
    "daysCompleted": 12,
    "totalDays": 54,
    "currentDay": {
      "id": "js-day-03",
      "courseTitle": "JavaScript",
      "dayNumber": 3,
      "title": "Arrays, Objects & Destructuring"
    },
    "todayActiveSeconds": 5400,
    "totalActiveSeconds": 151200,
    "totalCodingSeconds": 88000,
    "lastActiveDate": "2026-10-09",
    "latestWpm": 54,
    "flagsLast7Days": 3,
    "averageScore": 91,
    "daysScored": 12
  }
]
```

- **Field rules** (`admin.service.ts`):
  - `daysCompleted`: this trainee's `day_completion` rows; `totalDays`: all curriculum days.
  - `currentDay`: the first day in curriculum order that isn't completed; `null` = finished everything.
  - `todayActiveSeconds`: today's (IST) `activity_log.active_seconds`, else 0. `totalActiveSeconds` / `totalCodingSeconds`: sums of all their rows.
  - `lastActiveDate`: the latest `activity_log.date` (`"YYYY-MM-DD"`), or `null` if they have never been active. The frontend doesn't mark `null` as inactive.
  - `latestWpm`: WPM of their most recent typing test, or `null`.
  - `flagsLast7Days`: flag events with `timestamp` in the last 7 × 24 hours.
  - `averageScore`: the average of their **day** integrity scores (same rule as `GET /api/days/:dayId/integrity`), rounded; `null` when no day has a score. `daysScored`: how many days the average uses (`integrity.overall.ts`).

- **Errors:** 401; 403.

### POST /api/admin/trainees

- **Auth:** admin.
- **Request body** (`CreateTraineeRequest`, `createTraineeSchema`):

| Field   | Type   | Rules                                                                                                          |
| ------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `name`  | string | Trimmed, 2–80 chars (`"Enter the full name."`, `"Keep the name under 80 characters."`); inner spaces collapsed |
| `email` | string | Trimmed, lower-cased, a valid email (`"Enter a valid email address."`), ≤ 254 chars                            |

```json
{ "name": "Rahul Nair", "email": "rahul.nair@vonnue.com" }
```

- **Business rules:**
  1. The email must end with `@${ALLOWED_EMAIL_DOMAIN}` → else `400 DOMAIN_NOT_PERMITTED`.
  2. An `admin` row with that email (active or not) → `409 EMAIL_BELONGS_TO_ADMIN`. A `trainee` with that email → `409 TRAINEE_EXISTS` (also when two requests race and the unique index rejects the second).
  3. Creates the `trainee` row. Nothing else is created: the trainee starts on day 1 with no progress. The admin id and new trainee id are logged.
- **Response 201** (`AdminTraineeSummary`): the new trainee's row exactly as `GET /api/admin/trainees` would return it (`daysCompleted: 0`, `lastActiveDate: null`, `averageScore: null`, …), so the page can insert it as is.
- **Errors:** 400 `VALIDATION_FAILED` / `DOMAIN_NOT_PERMITTED`; 401; 403; 409 `TRAINEE_EXISTS` / `EMAIL_BELONGS_TO_ADMIN`.

### GET /api/admin/trainees/:traineeId

- **Auth:** admin.
- **Response 200** (`AdminTraineeDetail`):

```json
{
  "id": "8f2c1d4e-6a3b-4c1e-9f7a-2b5d8e0c1a33",
  "profile": {
    "trainee": { "name": "Asha K", "…": "…" },
    "total": {},
    "typing": {},
    "dailyActivity": []
  },
  "courses": [
    {
      "id": "html",
      "title": "HTML",
      "days": [
        {
          "id": "html-day-01",
          "dayNumber": 1,
          "title": "…",
          "status": "COMPLETED",
          "completedAt": "2026-09-29T11:02:45.000Z"
        }
      ]
    }
  ],
  "tasks": [
    {
      "taskId": "html-day-01-t-1",
      "title": "Semantic page skeleton",
      "dayId": "html-day-01",
      "isStretchGoal": false,
      "status": "completed",
      "codeUpdatedAt": "2026-09-29T10:40:12.000Z",
      "lastSubmittedAt": "2026-09-29T10:41:03.000Z"
    }
  ],
  "totalTasks": 260,
  "journal": [
    {
      "dayId": "html-day-01",
      "courseTitle": "HTML",
      "dayNumber": 1,
      "dayTitle": "…",
      "responseText": "…",
      "updatedAt": "2026-09-29T11:05:00.000Z"
    }
  ]
}
```

- **Field rules:**
  - `profile`: the same object `GET /api/profile` returns for this trainee.
  - `courses`: every course and day in curriculum order, with this trainee's status (day locking rule) and `completedAt`.
  - `tasks`: the trainee's **submitted** tasks (`task_progress.status = 'completed'`), in curriculum order. Tasks never submitted are left out; the day grid shows how far they are.
  - `totalTasks`: number of tasks in the curriculum.
  - `journal`: all their journal responses, in curriculum order.
- **Errors:** 400 (bad UUID); 401; 403; 404 `"Trainee not found."`.

### GET /api/admin/trainees/:traineeId/flags

- **Auth:** admin.
- **Response 200** (`AdminFlagEvent[]`): the trainee's flag events, newest first, at most 500. Nothing is filtered on the server; the Flags tab hides `LOW` events by default.

```json
[
  {
    "id": "c2f8…",
    "type": "TAB_SWITCH",
    "taskId": "js-day-02-t-3",
    "taskTitle": "Grade calculator",
    "dayId": "js-day-02",
    "durationMs": 42000,
    "reviewPriority": "HIGH",
    "timestamp": "2026-10-08T06:12:44.000Z"
  }
]
```

- **Errors:** 400; 401; 403; 404 `"Trainee not found."`.

### GET /api/admin/trainees/:traineeId/tasks/:taskId/code

- **Auth:** admin.
- **Path params:** `traineeId` (UUID), `taskId` (string, 1–100 chars).
- **Behaviour:** read-only: never creates a progress row and never logs a flag.
- **Response 200** (`AdminTaskCode`):

```json
{
  "taskId": "html-day-01-t-1",
  "title": "Semantic page skeleton",
  "status": "completed",
  "isStarterCode": false,
  "files": [{ "path": "index.html", "content": "<!doctype html>…" }],
  "codeUpdatedAt": "2026-09-29T10:40:12.000Z",
  "lastSubmittedAt": "2026-09-29T10:41:03.000Z"
}
```

`isStarterCode: true` and `status: "not_started"` mean the trainee never saved this task; `files` are then the task's starter files.

- **Errors:** 400; 401; 403; 404 `"Trainee not found."` / `"Task not found."`.
