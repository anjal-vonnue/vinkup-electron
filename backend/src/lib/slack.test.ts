import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  SLACK_ENABLED: false,
  SLACK_BOT_TOKEN: undefined as string | undefined,
}));

vi.mock('../config/env', () => ({
  env: envMock,
}));

import { postSlackMessage, SlackApiError } from './slack';

describe('postSlackMessage', () => {
  beforeEach(() => {
    envMock.SLACK_ENABLED = false;
    envMock.SLACK_BOT_TOKEN = undefined;
    vi.restoreAllMocks();
  });

  it('throws when Slack is disabled', async () => {
    await expect(postSlackMessage({ channel: 'C1', text: 'hi' })).rejects.toMatchObject({
      name: 'SlackApiError',
      slackError: 'slack_disabled',
    });
  });

  it('throws when token is missing while enabled', async () => {
    envMock.SLACK_ENABLED = true;
    await expect(postSlackMessage({ channel: 'C1', text: 'hi' })).rejects.toMatchObject({
      slackError: 'missing_token',
    });
  });

  it('posts message with bot token', async () => {
    envMock.SLACK_ENABLED = true;
    envMock.SLACK_BOT_TOKEN = 'xoxb-test';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: '123.456', channel: 'C1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await postSlackMessage({ channel: 'C1', text: 'hello', blocks: [] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer xoxb-test');
    expect(result).toEqual({ ok: true, ts: '123.456', channel: 'C1' });
  });

  it('throws SlackApiError for Slack error responses', async () => {
    envMock.SLACK_ENABLED = true;
    envMock.SLACK_BOT_TOKEN = 'xoxb-test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
    );

    await expect(postSlackMessage({ channel: 'C1', text: 'hello' })).rejects.toBeInstanceOf(
      SlackApiError
    );
    await expect(postSlackMessage({ channel: 'C1', text: 'hello' })).rejects.toMatchObject({
      slackError: 'channel_not_found',
    });
  });

  it('captures retry-after on rate limits', async () => {
    envMock.SLACK_ENABLED = true;
    envMock.SLACK_BOT_TOKEN = 'xoxb-test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: 'ratelimited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
        })
      )
    );

    await expect(postSlackMessage({ channel: 'C1', text: 'hello' })).rejects.toMatchObject({
      status: 429,
      slackError: 'ratelimited',
      retryAfterSeconds: 30,
    });
  });
});
