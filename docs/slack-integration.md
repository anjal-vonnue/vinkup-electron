# Slack Integration

Vinkup can send task submission notifications to a Slack channel configured by each mentor.
One shared Slack bot is used by the whole application; mentors do not create bots or enter tokens.

## How it works

1. A mentor saves a Slack **channel ID** in the **Integrations** tab of the mentor dashboard.
2. When a trainee submits or resubmits a task, the backend resolves the trainee's assigned mentor
   at submission time.
3. If that mentor has a channel configured and `SLACK_ENABLED=true`, a notification record is
   written to the `slack_notification_outbox` table in the same database transaction as the
   submission. No Slack API call is made from the request.
4. A background worker claims pending records, posts the message with `chat.postMessage`, and
   records `SENT`, `FAILED`, or a future retry time.

If Slack is disabled, the mentor has no channel, or a submission fails, the task workflow continues
normally with no Slack notification. Existing in-app/SSE notifications are unchanged.

## Slack app setup

1. In [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App → From scratch**.
2. Open **OAuth & Permissions → Bot Token Scopes** and add **`chat:write`**.
3. Open **OAuth & Permissions → Install App to Workspace** and install the app.
4. Copy the **Bot User OAuth Token** (`xoxb-...`) into `backend/.env` as `SLACK_BOT_TOKEN`.
5. Invite the bot to every mentor channel that should receive notifications:
   in the Slack channel, type `/invite @<your-bot-name>`.

No `SLACK_APP_TOKEN`, Socket Mode, event subscriptions, or message listeners are required.
This is an outgoing-message-only integration.

## Find a channel ID

In Slack, open the channel, click the channel name at the top, then open **View channel details**.
The Channel ID is shown near the bottom (for example `C0123ABCDEF`). It starts with `C` (or `D`
for a direct message, but Vinkup expects public/private channels). Copy that value into Vinkup.

## Configure a mentor channel in Vinkup

Sign in as a mentor and open the mentor dashboard (`/admin`), then select the **Integrations** tab.

- **Add:** paste the Channel ID and choose **Save Channel**.
- **View:** the configured ID is shown with a **Connected** badge.
- **Update:** choose **Edit**, replace the ID, then choose **Save Channel**. **Cancel** restores the
  old value.
- **Delete:** choose **Disconnect**, then confirm in the dialog. Notifications stop for future
  submissions; already queued notifications keep their original destination.

The backend derives the mentor ID from the authenticated session. A mentor cannot view or change
another mentor's channel, and trainees/managers cannot access these endpoints.

### API endpoints

| Method | Path                      | Description                                                  |
| ------ | ------------------------- | ------------------------------------------------------------ |
| GET    | `/api/admin/slack-channel` | Returns `{ "channelId": string \| null }`                    |
| PUT    | `/api/admin/slack-channel` | Saves/replaces the channel: `{ "channelId": "C0123ABCDEF" }` |
| DELETE | `/api/admin/slack-channel` | Clears the channel; returns `{ "channelId": null }`          |

Channel IDs are trimmed, upper-cased by the UI, and validated server-side as 1–32 uppercase letters/digits.

## Backend environment

Add these to `backend/.env` (see `backend/.env.example`):

```env
SLACK_ENABLED=false
SLACK_BOT_TOKEN=
```

- `SLACK_ENABLED` defaults to `false`. Accepted true values: `true`, `1`; false values: `false`,
  `0`, blank.
- When enabled, `SLACK_BOT_TOKEN` must contain the shared bot token; startup fails with a clear
  validation error otherwise.
- When disabled, no Slack credentials are needed and the worker does not start.
- The bot token is never returned by any API and is never sent to the frontend.

## Outbox and retries

The outbox row stores the channel ID resolved at submission time. Changing or deleting the mentor's
configuration later affects only future notifications.

- **Statuses:** `PENDING`, `PROCESSING`, `SENT`, `FAILED`.
- **Claiming:** the worker uses `FOR UPDATE SKIP LOCKED` so multiple workers cannot process the
  same row concurrently. Claimed rows get a processing lease.
- **Success:** `SENT`, with `sent_at`.
- **Temporary failures** (network, 5xx, HTTP 429/`ratelimited`): retried with exponential backoff
  (15 s base, capped at 5 min, with jitter). Slack's `Retry-After` header is honored when present.
- **Permanent failures** (`invalid_auth`, `missing_scope`, `channel_not_found`, archived channel,
  etc.) and attempts beyond `max_attempts` (default 5) are marked `FAILED` and kept for inspection.
- **Restart recovery:** expired `PROCESSING` leases are returned to `PENDING` on worker startup.
- The worker starts when the backend listens and stops gracefully on `SIGINT`/`SIGTERM`.

## Message contents

Messages include trainee name, task title, course title, day number (when available), submission
count, submission timestamp, and review status. User-provided text is escaped and Slack mention
triggers are neutralized so a submission cannot accidentally mention `@channel`, `@here`, or
`@everyone`. Internal IDs and tokens are not included.

## Known limitations

- Live delivery depends on a real Slack workspace, a valid token with `chat:write`, and the bot
  being invited to each channel. Automated tests mock all Slack API calls.
- The worker polls every 5 seconds; notifications are near-real-time, not instant.
- Failed rows are retained for investigation; there is no admin UI to replay them yet.
