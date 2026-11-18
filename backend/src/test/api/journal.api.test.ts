import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DayJournal } from '@itp/types';
import { db } from './helpers/db.js';
import { DAY, freshTrainees, seedCurriculum, type TestTrainee } from './helpers/fixtures.js';
import { api, body, expectError } from './helpers/http.js';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

const url = (dayId: string) => `/api/days/${dayId}/journal`;

describe('GET /api/days/:dayId/journal', () => {
  it('returns responseText null (not 404) before anything is written', async () => {
    const res = await api.get(url(DAY.html1), a.cookie);
    expect(res.status).toBe(200);
    expect(body<DayJournal>(res)).toEqual({ responseText: null });
  });

  it('returns 403 DAY_LOCKED for a locked day', async () => {
    expectError(await api.get(url(DAY.html2), a.cookie), 403, 'DAY_LOCKED');
  });

  it('returns 404 NOT_FOUND for an unknown day', async () => {
    expectError(await api.get(url('html-day-99'), a.cookie), 404, 'NOT_FOUND');
  });
});

describe('PUT /api/days/:dayId/journal', () => {
  it('saves the answer, returns it, and GET returns it afterwards', async () => {
    const put = await api.put(url(DAY.html1), { responseText: 'Semantic tags help.' }, a.cookie);
    expect(put.status).toBe(200);
    expect(body<DayJournal>(put)).toEqual({ responseText: 'Semantic tags help.' });

    const get = await api.get(url(DAY.html1), a.cookie);
    expect(body<DayJournal>(get)).toEqual({ responseText: 'Semantic tags help.' });
  });

  it('replaces the answer instead of adding a second row', async () => {
    await api.put(url(DAY.html1), { responseText: 'First answer' }, a.cookie);
    await api.put(url(DAY.html1), { responseText: 'Second answer' }, a.cookie);

    const rows = await db.journal_response.findMany({ where: { trainee_id: a.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].response_text).toBe('Second answer');
  });

  it('trims surrounding whitespace', async () => {
    const res = await api.put(url(DAY.html1), { responseText: '  Padded answer \n' }, a.cookie);
    expect(body<DayJournal>(res)).toEqual({ responseText: 'Padded answer' });
  });

  it("keeps each trainee's answer separate", async () => {
    await api.put(url(DAY.html1), { responseText: 'Answer from B' }, b.cookie);

    const res = await api.get(url(DAY.html1), a.cookie);
    expect(body<DayJournal>(res)).toEqual({ responseText: null });
  });

  it('ignores a traineeId in the body and saves for the logged-in trainee', async () => {
    await api.put(url(DAY.html1), { responseText: 'Mine', traineeId: b.id }, a.cookie);

    expect(await db.journal_response.count({ where: { trainee_id: a.id } })).toBe(1);
    expect(await db.journal_response.count({ where: { trainee_id: b.id } })).toBe(0);
  });

  it.each([
    ['missing', {}],
    ['empty', { responseText: '' }],
    ['only spaces', { responseText: '   ' }],
    ['not a string', { responseText: 42 }],
    ['over 5,000 characters', { responseText: 'a'.repeat(5001) }],
  ])('returns 400 VALIDATION_FAILED when responseText is %s', async (_label, payload) => {
    expectError(await api.put(url(DAY.html1), payload, a.cookie), 400, 'VALIDATION_FAILED');
  });

  it('accepts exactly 5,000 characters', async () => {
    const res = await api.put(url(DAY.html1), { responseText: 'a'.repeat(5000) }, a.cookie);
    expect(res.status).toBe(200);
  });

  it('returns 403 DAY_LOCKED for a locked day and saves nothing', async () => {
    expectError(
      await api.put(url(DAY.html2), { responseText: 'Too early' }, a.cookie),
      403,
      'DAY_LOCKED'
    );
    expect(await db.journal_response.count()).toBe(0);
  });

  it('returns 404 NOT_FOUND for an unknown day', async () => {
    expectError(
      await api.put(url('html-day-99'), { responseText: 'Hello' }, a.cookie),
      404,
      'NOT_FOUND'
    );
  });
});
