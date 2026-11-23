import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MentorSlackChannelResponse } from '@itp/types';
import {
  assignTrainees,
  createAdmin,
  freshTrainees,
  seedCurriculum,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError } from './helpers/http';

let mentorA: TestAdmin;
let mentorB: TestAdmin;
let trainee: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a: trainee } = await freshTrainees());
  mentorA = await createAdmin('Mentor A');
  mentorB = await createAdmin('Mentor B');
  await assignTrainees(mentorA, trainee);
});

const CHANNEL = '/api/admin/slack-channel';

async function getChannel(cookie: string): Promise<MentorSlackChannelResponse> {
  const res = await api.get(CHANNEL, cookie);
  expect(res.status).toBe(200);
  return body<MentorSlackChannelResponse>(res);
}

describe('Mentor Slack channel configuration', () => {
  it('returns null when no channel is configured', async () => {
    await expect(getChannel(mentorA.cookie)).resolves.toEqual({ channelId: null });
  });

  it('allows a mentor to add their own channel ID', async () => {
    const res = await api.put(CHANNEL, { channelId: 'C0123ABCDEF' }, mentorA.cookie);

    expect(res.status).toBe(200);
    expect(body<MentorSlackChannelResponse>(res)).toEqual({ channelId: 'C0123ABCDEF' });
    await expect(getChannel(mentorA.cookie)).resolves.toEqual({ channelId: 'C0123ABCDEF' });
  });

  it('allows a mentor to update their channel ID', async () => {
    await api.put(CHANNEL, { channelId: 'C0123ABCDEF' }, mentorA.cookie);
    const res = await api.put(CHANNEL, { channelId: 'C9999UPDATED' }, mentorA.cookie);

    expect(res.status).toBe(200);
    expect(body<MentorSlackChannelResponse>(res)).toEqual({ channelId: 'C9999UPDATED' });
    await expect(getChannel(mentorA.cookie)).resolves.toEqual({ channelId: 'C9999UPDATED' });
  });

  it('allows a mentor to delete their channel ID', async () => {
    await api.put(CHANNEL, { channelId: 'C0123ABCDEF' }, mentorA.cookie);
    const res = await api.delete(CHANNEL, mentorA.cookie);

    expect(res.status).toBe(200);
    expect(body<MentorSlackChannelResponse>(res)).toEqual({ channelId: null });
    await expect(getChannel(mentorA.cookie)).resolves.toEqual({ channelId: null });
  });

  it('handles repeated delete operations idempotently', async () => {
    await api.delete(CHANNEL, mentorA.cookie);
    const res = await api.delete(CHANNEL, mentorA.cookie);

    expect(res.status).toBe(200);
    expect(body<MentorSlackChannelResponse>(res)).toEqual({ channelId: null });
  });

  it('does not allow a mentor to modify another mentor channel configuration', async () => {
    await api.put(CHANNEL, { channelId: 'CMENTORA001' }, mentorA.cookie);
    await api.put(CHANNEL, { channelId: 'CMENTORB002' }, mentorB.cookie);

    await expect(getChannel(mentorA.cookie)).resolves.toEqual({ channelId: 'CMENTORA001' });
    await expect(getChannel(mentorB.cookie)).resolves.toEqual({ channelId: 'CMENTORB002' });

    await api.delete(CHANNEL, mentorB.cookie);
    await expect(getChannel(mentorA.cookie)).resolves.toEqual({ channelId: 'CMENTORA001' });
  });

  it('rejects trainee access to mentor Slack settings', async () => {
    expectError(await api.get(CHANNEL, trainee.cookie), 403, 'FORBIDDEN');
    expectError(await api.put(CHANNEL, { channelId: 'C0123ABCDEF' }, trainee.cookie), 403, 'FORBIDDEN');
    expectError(await api.delete(CHANNEL, trainee.cookie), 403, 'FORBIDDEN');
  });

  it('rejects unauthenticated requests', async () => {
    expectError(await api.get(CHANNEL), 401, 'UNAUTHENTICATED');
    expectError(await api.put(CHANNEL, { channelId: 'C0123ABCDEF' }), 401, 'UNAUTHENTICATED');
    expectError(await api.delete(CHANNEL), 401, 'UNAUTHENTICATED');
  });

  it('rejects invalid channel IDs', async () => {
    const invalid = ['', '   ', 'not-a-channel', 'C0123 ABC', 'C0123/ABC', 'C'.repeat(33)];

    for (const channelId of invalid) {
      const res = await api.put(CHANNEL, { channelId }, mentorA.cookie);
      expectError(res, 400, 'VALIDATION_FAILED');
    }
  });

  it('handles repeated save operations with the same channel ID', async () => {
    await api.put(CHANNEL, { channelId: 'C0123ABCDEF' }, mentorA.cookie);
    const res = await api.put(CHANNEL, { channelId: 'C0123ABCDEF' }, mentorA.cookie);

    expect(res.status).toBe(200);
    expect(body<MentorSlackChannelResponse>(res)).toEqual({ channelId: 'C0123ABCDEF' });
  });
});
