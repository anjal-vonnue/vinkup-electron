import { env } from '../config/env';

export type SlackPostMessageInput = {
  channel: string;
  text: string;
  blocks?: unknown[];
};

export type SlackPostMessageResult = {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
  retryAfterSeconds?: number;
};

export class SlackApiError extends Error {
  readonly status: number;
  readonly slackError?: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, opts: { status: number; slackError?: string; retryAfterSeconds?: number }) {
    super(message);
    this.name = 'SlackApiError';
    this.status = opts.status;
    this.slackError = opts.slackError;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export async function postSlackMessage(input: SlackPostMessageInput): Promise<SlackPostMessageResult> {
  if (!env.SLACK_ENABLED) {
    throw new SlackApiError('Slack integration is disabled', { status: 503, slackError: 'slack_disabled' });
  }
  if (!env.SLACK_BOT_TOKEN) {
    throw new SlackApiError('Slack bot token is not configured', { status: 503, slackError: 'missing_token' });
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: input.channel,
      text: input.text,
      ...(input.blocks ? { blocks: input.blocks } : {}),
    }),
  });

  const retryAfterSeconds = parseRetryAfter(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const slackBody = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const ok = slackBody.ok === true;

  if (!response.ok) {
    const slackError = typeof slackBody.error === 'string' ? slackBody.error : undefined;
    throw new SlackApiError(`Slack API request failed (${response.status})`, {
      status: response.status,
      slackError,
      retryAfterSeconds,
    });
  }

  if (!ok) {
    const slackError = typeof slackBody.error === 'string' ? slackBody.error : 'unknown_error';
    throw new SlackApiError(`Slack API returned error: ${slackError}`, {
      status: 200,
      slackError,
      retryAfterSeconds,
    });
  }

  return {
    ok: true,
    ts: typeof slackBody.ts === 'string' ? slackBody.ts : undefined,
    channel: typeof slackBody.channel === 'string' ? slackBody.channel : undefined,
  };
}
