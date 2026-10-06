import request from 'supertest';
import {app} from '../utils/app';
import {clearDb, clock} from '../utils';
import {gameDayAt, gameWeekAt} from '../../src/duties/resets';

describe('game resets', () => {
  beforeEach(async () => {
    await clearDb();
  });

  afterEach(() => {
    clock.now = undefined;
  });

  test.each([
    // Before and at the 15:00 UTC reset.
    ['2026-10-06T14:59:59Z', '2026-10-05T15:00:00Z'],
    ['2026-10-06T15:00:00Z', '2026-10-06T15:00:00Z'],
    // Summer and winter time in Europe: the reset stays at 15:00 UTC.
    ['2026-07-01T16:00:00Z', '2026-07-01T15:00:00Z'],
    ['2026-12-01T16:00:00Z', '2026-12-01T15:00:00Z'],
    // The night the clocks go back (2026-10-25).
    ['2026-10-25T01:30:00Z', '2026-10-24T15:00:00Z'],
  ])('at %s, the game day should start at %s', (at, from) => {
    expect(gameDayAt(new Date(at))).toStrictEqual({
      from: new Date(from),
      until: new Date(new Date(from).getTime() + 24 * 3600 * 1000),
    });
  });

  test.each([
    // Tuesday 2026-10-06, before and at the 08:00 UTC reset.
    ['2026-10-06T07:59:59Z', '2026-09-29T08:00:00Z'],
    ['2026-10-06T08:00:00Z', '2026-10-06T08:00:00Z'],
    // Later in the week, and across the clocks changing.
    ['2026-10-12T23:00:00Z', '2026-10-06T08:00:00Z'],
    ['2026-10-27T09:00:00Z', '2026-10-27T08:00:00Z'],
    ['2026-03-30T12:00:00Z', '2026-03-24T08:00:00Z'],
  ])('at %s, the game week should start at %s', (at, from) => {
    const week = gameWeekAt(new Date(at));
    expect(week.from).toStrictEqual(new Date(from));
    expect(week.from.getUTCDay()).toBe(2);
    expect(week.until.getTime() - week.from.getTime()).toBe(
      7 * 24 * 3600 * 1000
    );
  });

  test('GET /api/resets should return the game day and week in progress', async () => {
    clock.now = new Date('2026-10-06T16:30:00Z');

    const response = await request(app).get('/api/resets').send();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toStrictEqual({
      now: '2026-10-06T16:30:00.000Z',
      daily: {
        from: '2026-10-06T15:00:00.000Z',
        until: '2026-10-07T15:00:00.000Z',
      },
      weekly: {
        from: '2026-10-06T08:00:00.000Z',
        until: '2026-10-13T08:00:00.000Z',
      },
    });
  });
});
