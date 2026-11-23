# Leave request workflow

Leave requests are submitted by Trainees and reviewed by Mentors and Managers. The workflow uses only
three statuses — `PENDING`, `APPROVED` and `REJECTED` — and never introduces an intermediate state.
A decision is kept as an append-only review record, so a later decision cannot erase an earlier one.

## Roles and responsibilities

| Role    | Submit | Read                                            | Allowed decisions                                                     |
| ------- | ------ | ----------------------------------------------- | --------------------------------------------------------------------- |
| Trainee | Yes    | Only their own requests                         | None — there is no trainee review endpoint                            |
| Mentor  | No     | Only requests for `trainee.mentor_id = user.id` | Approve or reject `PENDING` requests for assigned trainees            |
| Manager | No     | Every request                                   | Approve or reject any `PENDING` request; reject an `APPROVED` request |

Mentors cannot review requests for trainees who are not currently assigned to them; an unknown or
out-of-scope id returns `404 NOT_FOUND`. Managers can review any request, including one belonging to a
trainee assigned to a different Mentor. Role checks run in middleware, in the service and in every
database query. Reviewer identity always comes from the authenticated user, never from the request
body.

## Lifecycle

1. A Trainee submits a subject (1–200 chars) and reason (1–2,000 chars). The request starts `PENDING`
   with no reviewer, feedback or review timestamp.
2. A Mentor (or a Manager, for example when the Mentor is on leave) reviews a `PENDING` request. An
   approval may include optional feedback; a rejection must include non-blank feedback (max 2,000
   chars). The current status becomes `APPROVED` or `REJECTED`.
3. If a Mentor approved the request, a Manager can still review it and **reject** it. Feedback is
   required. The final status becomes `REJECTED`; the Mentor's approval stays in the review history.
4. No other change is allowed: Mentors cannot modify decided requests, and Managers cannot approve a
   request that is already approved or change a decision that is already final.

| Current status | Reviewer | Decision | Result                         |
| -------------- | -------- | -------- | ------------------------------ |
| `PENDING`      | Mentor   | Approve  | `APPROVED`                     |
| `PENDING`      | Mentor   | Reject   | `REJECTED`                     |
| `PENDING`      | Manager  | Approve  | `APPROVED`                     |
| `PENDING`      | Manager  | Reject   | `REJECTED`                     |
| `APPROVED`     | Mentor   | Any      | `409 ALREADY_REVIEWED`         |
| `APPROVED`     | Manager  | Reject   | `REJECTED` (requires feedback) |
| `APPROVED`     | Manager  | Approve  | `409 ALREADY_REVIEWED`         |
| `REJECTED`     | Anyone   | Any      | `409 ALREADY_REVIEWED`         |

## Review history and feedback

Two structures are written in the same transaction:

- `leave_request` keeps the request content and a snapshot of the **current/final** decision
  (`status`, `reviewer_id`, `reviewer_role`, `reviewer_name`, `feedback`, `reviewed_at`). Existing API
  clients continue to read these fields.
- `leave_review` is an **append-only** row per decision with the reviewer id, role, name, decision,
  feedback and timestamp. At most one row per role exists for a request
  (`UNIQUE (leave_request_id, reviewer_role)`), so a Manager's rejection cannot overwrite or delete
  the Mentor's approval.

Every `LeaveRequest` API response contains `reviews`, an array of `LeaveReview` objects ordered oldest
first. Trainees, Mentors and Managers all see the same complete history: the Trainee page shows it in
each history card, and the shared staff page shows it in the detail dialog. Each entry displays who
reviewed the request, their role, the decision, the timestamp and any feedback. Pending requests have
an empty `reviews` array.

Example of a request approved by a Mentor and then rejected by a Manager:

```json
{
  "status": "REJECTED",
  "reviewerId": "manager-id",
  "reviewerRole": "MANAGER",
  "feedback": "The dates changed after approval.",
  "reviews": [
    {
      "id": "review-1",
      "reviewerId": "mentor-id",
      "reviewerName": "Mentor Alice",
      "reviewerRole": "MENTOR",
      "decision": "APPROVED",
      "feedback": "Enjoy the time off.",
      "reviewedAt": "2026-11-21T11:00:00.000Z"
    },
    {
      "id": "review-2",
      "reviewerId": "manager-id",
      "reviewerName": "Manager Bob",
      "reviewerRole": "MANAGER",
      "decision": "REJECTED",
      "feedback": "The dates changed after approval.",
      "reviewedAt": "2026-11-21T12:00:00.000Z"
    }
  ]
}
```

## Integrity and concurrency

The repository performs the scope check, status check, conditional `updateMany` and history insert in
one transaction. A conditional `UPDATE ... WHERE status = 'PENDING'` (or
`status = 'APPROVED' AND reviewer_role = 'MENTOR'` for a Manager rejection) guarantees that only one
of two concurrent decisions wins; the loser receives `409 ALREADY_REVIEWED`. The
`UNIQUE (leave_request_id, reviewer_role)` index on `leave_review` is a second guard against duplicate
reviews.

Database constraints still enforce non-blank subjects, reasons and rejection feedback, forbid review
fields while `PENDING`, and require reviewer details once decided. The
`leave_request_status_guard` trigger permits only `PENDING → APPROVED/REJECTED` and
`APPROVED → REJECTED` (Mentor approval to Manager rejection); all other status or review-field
changes are rejected even outside the API. Foreign keys use `ON DELETE RESTRICT` so removing an
account cannot erase request or review history.

The migration `20261123150000_add_leave_review_history` creates the history table, backfills a review
row for every already-decided request from its existing columns, and replaces the old "decision is
final" trigger. No records are deleted.

See [api-specifications.md](./api-specifications.md#leave-requests) for endpoints and
[database.md](./database.md) for table definitions.
