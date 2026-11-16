# Task review workflow

How a trainee submission becomes **approved**, or comes back as **rework**, and how every
review is kept as history.

## Roles and identity

Only the existing `Trainee` and `Admin` accounts are used. There is no separate student,
mentor or reviewer entity.

| Actor   | Who they are                | Where identity comes from             |
| ------- | --------------------------- | ------------------------------------- |
| Trainee | The signed-in `trainee` row | `req.user.id` behind `requireTrainee` |
| Admin   | The signed-in `admin` row   | `req.user.id` behind `requireAdmin`   |

The server **never** trusts a trainee id sent by the browser. Trainee endpoints take the
trainee from the session, and admin endpoints take the target trainee from the `:traineeId`
path parameter (validated as a UUID) with the reviewing admin taken from the session.
`GET /api/tasks/:taskId/review` also checks that the task belongs to a day the trainee has
unlocked, so a review cannot leak across trainees or locked days.

## Lifecycle

```
not started / in progress
          │  Trainee submits (POST /api/tasks/:taskId/submit)
          ▼
      completed · review_status = pending        ── admin approval ──▶ approved (final)
          │
          │  Admin requests rework (feedback required)
          ▼
      completed · review_status = rework
          │  Trainee edits and resubmits
          ▼
      completed · review_status = pending   (submission_count + 1)
```

Allowed transitions:

| Transition            | Performed by | Effect                                                                   |
| --------------------- | ------------ | ------------------------------------------------------------------------ |
| Submit / resubmit     | Trainee      | `status = completed`, `review_status = pending`, `submission_count += 1` |
| Approve               | Admin        | `review_status = approved`; optional note, may be empty                  |
| Request rework        | Admin        | `review_status = rework`; feedback is required                           |
| Resubmit after rework | Trainee      | Back to `pending`, attempt count increases                               |

Blocked transitions:

- A task that is already `approved` cannot be resubmitted: `POST /submit` returns
  `409 ALREADY_APPROVED`.
- A submission that is already `approved` or `rework` cannot be reviewed again. The next
  review must wait for the trainee to resubmit: `409 ALREADY_REVIEWED`.
- A task without a completed submission cannot be reviewed: `409 TASK_NOT_SUBMITTED`.
- Leaving rework feedback empty or whitespace is rejected: `400 VALIDATION_FAILED`.
- Approving a second time, or clicking Approve and Rework at the same moment, is rejected by
  a unique key `(trainee_id, task_id, submission_no)`, so one attempt can only be judged once.

`review_status` is nullable on purpose:

- `NULL` — the submission has never been reviewed. This includes submissions created before
  this feature existed.
- `pending` — waiting for an admin.
- `approved` / `rework` — the latest decision.

A resubmission always sets it back to `pending`; it never clears the previous history.

## Data model

`task_progress` stays the single current-state row per trainee and task:

| Column             | Type             | Notes                                                  |
| ------------------ | ---------------- | ------------------------------------------------------ |
| `status`           | `task_status`    | Unchanged: `not_started` / `in_progress` / `completed` |
| `review_status`    | `review_status?` | `pending` / `approved` / `rework`, or `NULL`           |
| `submission_count` | `Int`            | Starts at `0`; first successful submit makes it `1`    |

`task_review` is append-only history:

| Column                      | Type              | Notes                                                |
| --------------------------- | ----------------- | ---------------------------------------------------- |
| `id`                        | `UUID`            | Primary key                                          |
| `trainee_id`                | `UUID`            | FK → `trainee`, cascades on delete                   |
| `task_id`                   | `String`          | FK → `task`, cascades on delete                      |
| `admin_id`                  | `UUID`            | FK → `admin`, cascades on delete                     |
| `submission_no`             | `Int`             | The attempt being judged                             |
| `decision`                  | `review_decision` | `approved` / `rework`                                |
| `feedback`                  | `String`          | `''` for an approval without a note; max 5,000 chars |
| `reviewed_at`               | `TIMESTAMPTZ`     | When the decision was made                           |
| `created_at` / `updated_at` | `TIMESTAMPTZ`     | Audit timestamps                                     |

Indexes:

- `(trainee_id, task_id, submission_no)` **unique** — one review per attempt.
- `(trainee_id, task_id, reviewed_at)` — task history queries.
- `(trainee_id, reviewed_at)` — a trainee's feedback feed.

The review row and the `task_progress.review_status` update are written in one interactive
transaction, so the current state can never disagree with the history.

### Migration

`backend/prisma/migrations/20261112070928_add_task_review_workflow/migration.sql`

1. Creates the `review_status` and `review_decision` enums.
2. Adds `review_status` and `submission_count` to `task_progress`.
3. Backfills `submission_count = 1` for rows already `completed`; `review_status` stays
   `NULL` so legacy submissions remain reviewable.
4. Creates `task_review`, its indexes and foreign keys.

Apply with:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

## API

All endpoints require a signed-in session. Trainee endpoints are mounted behind
`requireTrainee`; admin endpoints behind `requireAdmin`.

| Method | Path                                                   | Actor   | Purpose                                     |
| ------ | ------------------------------------------------------ | ------- | ------------------------------------------- |
| GET    | `/api/tasks/:taskId/review`                            | Trainee | Own review state + latest review            |
| GET    | `/api/tasks/:taskId/reviews`                           | Trainee | Own review history, newest first            |
| POST   | `/api/admin/trainees/:traineeId/tasks/:taskId/approve` | Admin   | Approve the current submission              |
| POST   | `/api/admin/trainees/:traineeId/tasks/:taskId/rework`  | Admin   | Send the current submission back            |
| GET    | `/api/admin/trainees/:traineeId/tasks/:taskId/reviews` | Admin   | Review history for one task                 |
| GET    | `/api/admin/trainees/:traineeId/feedback`              | Admin   | Every feedback-bearing review, newest first |

### `GET /api/tasks/:taskId/review`

```json
{
  "reviewStatus": "rework",
  "submissionCount": 2,
  "latestReview": {
    "id": "6a2f…",
    "taskId": "html-day-01-t-1",
    "adminId": "…",
    "adminName": "Mentor Alice",
    "submissionNo": 2,
    "decision": "rework",
    "feedback": "Please fix the heading hierarchy.",
    "reviewedAt": "2026-11-12T09:30:00.000Z"
  }
}
```

`reviewStatus` and `latestReview` are `null` when nothing has been submitted or reviewed.

### `POST .../approve`

- Body: optional `{ "feedback": "Optional note" }`; the whole body may be omitted.
- Response `201` with the created `TaskReview`.
- Errors: `400 VALIDATION_FAILED` (note over 5,000 chars), `403`, `404`
  (`Trainee not found.` / `Task not found.`), `409 TASK_NOT_SUBMITTED`,
  `409 ALREADY_REVIEWED`.

### `POST .../rework`

- Body: `{ "feedback": "What must change" }`; trimmed, required, 1–5,000 chars.
- Response `201` with the created `TaskReview`.
- Errors: `400 VALIDATION_FAILED`, `403`, `404`, `409 TASK_NOT_SUBMITTED`,
  `409 ALREADY_REVIEWED`.

### `POST /api/tasks/:taskId/submit`

Now returns the new review state:

```json
{
  "status": "completed",
  "submittedAt": "2026-11-12T09:20:00.000Z",
  "reviewStatus": "pending",
  "submissionCount": 3
}
```

Resubmitting an approved task returns `409 ALREADY_APPROVED`.

### Admin payload additions

- `AdminTaskRow` and `AdminTaskCode` now include `reviewStatus` and `submissionCount`.
- `DayTask` now includes optional `reviewStatus` (serialized as `null` when absent).
- `TaskResponse` now includes `reviewStatus` and `submissionCount`.
- `AdminFeedbackEntry` is the feed item: task id/title, day id, admin id/name, attempt number,
  decision, feedback text and timestamp.

## Frontend

Trainee:

- **Day overview / task modal** — submitted tasks show `Approved` (green), `Rework`
  (orange/clickable) or `Completed` (waiting for review). Clicking `Rework` opens the feedback
  modal with the admin name, review date, attempt number, feedback text and a **Go to Editor**
  action.
- **Task workspace** — the toolbar shows an approved badge or a clickable `Rework requested`
  pill, and the submit button reads `Approved` (disabled) or `Resubmit`. Resubmitting shows a
  `pending` state again and increments the attempt number.
- **Feedback modal** — fetches `GET /tasks/:taskId/review` when no review is passed in;
  handles loading, error, empty and loaded states, Escape/backdrop close and scroll lock.

Admin:

- **Task list** — each submitted task shows its review pill (`Approved`, `Rework`, or
  `Completed` while waiting) and the attempt number when it is above one.
- **Code panel** — for a completed, unreviewed submission it offers **Approve** and
  **Rework** plus a **History** toggle. Rework opens a dialog that requires non-empty
  feedback before calling the API. Already reviewed tasks show `Approved` /
  `Rework requested` instead of the action buttons. Success refreshes the trainee, code and
  feedback resources.
- **Feedbacks tab** — on the trainee detail page, lists every feedback-bearing review
  newest first. It can group by task (latest feedback prominent, older rounds expandable)
  or show a flat timeline, and shows an empty state before the first review.

The admin API client deliberately uses distinct function names (`approveTask`,
`requestRework`, `getAdminTaskReviews`, `getAdminTraineeFeedback`) so the review calls are
easy to mock in component tests.

## Tests

Backend:

- `backend/src/test/api/task-review.api.test.ts` — 20 API tests covering submit → pending,
  approve, rework (including validation), resubmission after rework, attempt counts, preserved
  history, blocked transitions, trainee isolation, admin authorization, task/trainee not found,
  feedback feed filtering/sorting and legacy unreviewed submissions.
- Updated unit and exact-shape API tests for the new fields.

Frontend:

- `TaskFeedbackModal.test.tsx` — fetch/initial review, loading, error, empty, close, editor
  action and Escape.
- `AdminFeedbackList.test.tsx` — empty state, grouped view, older-feedback expansion and
  timeline view.
- `AdminCodePanel.test.tsx` — review actions, required rework feedback, approved/rework badges.
- `AdminTraineePage.test.tsx` — Feedbacks tab content, newest-first data and empty state.
- `DayOverviewPage.test.tsx`, `TasModal.test.tsx`, `AdminTaskList.test.tsx`,
  `SubmitTaskButton.test.tsx` — status tags, clickable rework feedback, review pills and the
  approved/disabled submit state.

## Limitations

- **One decision per attempt.** An admin cannot silently change an earlier decision; they
  must ask for rework (or the trainee resubmits) so each decision stays in history.
- **No notifications.** The trainee sees a decision on the day/workspace the next time they
  load it; there is no email or push notification.
- **History is capped at 200 rows per query.** This is far above realistic attempt counts but
  is a fixed cap rather than pagination.
- **Feedback feed only includes non-empty feedback.** A plain approval with no note appears in
  the task history but not in the Feedbacks tab.
- **Admin-only, single reviewer.** Any admin can review any trainee; there is no assignment or
  reviewer-ownership model.
- **No status changes to `task_progress.status`.** Approval does not change `completed`; it only
  changes `review_status`, so day completion rules keep working exactly as before.
