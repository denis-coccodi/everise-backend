import 'jest-extended';
import request from 'supertest';
import {app, clock, partake, partakeEvent} from '../utils';

// Each test starts two hours after the last, so each event is read again.
let start = Date.parse('2026-10-16T18:00:00Z');
function at(offsetSeconds = 0) {
  clock.now = new Date(start + offsetSeconds * 1000);
  return clock.now;
}

const page = (id: string | number) => request(app).get(`/api/events/${id}`);

const NOT_LISTED =
  "That event isn't listed here: it may have been removed from Partake, or isn't one the site shows. Find another on the Events page.";

beforeEach(() => {
  start += 2 * 3_600_000;
  at();
  partake.status = 200;
  partake.events = [];
  partake.queries = [];
});

afterAll(() => {
  clock.now = undefined;
});

describe('GET /api/events/:id', () => {
  test('shows the event with its description as written, for everyone', async () => {
    partake.events = [partakeEvent()];

    const response = await page(56133);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(partake.queries).toHaveLength(1);
    expect(partake.queries[0]).toStartWith('{ event(id: 56133) {');
    expect(response.body.event).toMatchObject({
      id: 56133,
      title: 'CLUB NOIR- RSVP',
      ageRating: 'MATURE',
      url: 'https://www.partake.gg/events/56133',
      description:
        '![](https://cdn.partake.gg/assets/9cd45f8b43c84fbdb2b49a2185dd0bf2.webp)\n\n## Tonight\n\nBring a **date** and [dance](https://example.com) the night away.',
    });
  });

  test('still shows an event that ended, so a shared link opens', async () => {
    partake.events = [partakeEvent({}, -10)];

    const response = await page(56133);

    expect(response.status).toBe(200);
    expect(response.body.event.live).toBe(false);
  });

  test.each([
    ['an ADULT event', {ageRating: 'ADULT'}],
    ["another game's", {game: {id: 'world-of-warcraft'}}],
  ])('answers 404 for %s, by its link too', async (_name, overrides) => {
    partake.events = [partakeEvent(overrides)];

    const response = await page(56133);

    expect(response.status).toBe(404);
    expect(response.body.errors.body).toEqual([NOT_LISTED]);
  });

  test("answers 404 for an event Partake doesn't have, and remembers it", async () => {
    expect((await page(42)).status).toBe(404);
    at(60);
    expect((await page(42)).status).toBe(404);
    expect(partake.queries).toHaveLength(1);
  });

  test.each(['abc', '0', '1.5', '99999999999'])(
    'answers 422 for "%s"',
    async id => {
      const response = await page(id);

      expect(response.status).toBe(422);
      expect(response.body.errors.body).toEqual([
        "That isn't an event's number.",
      ]);
      expect(partake.queries).toEqual([]);
    },
  );

  test("keeps the event for an hour while Partake can't be reached", async () => {
    partake.status = 503;
    const never = await page(56133);
    expect(never.status).toBe(502);
    expect(never.body.errors.body).toEqual([
      "The events can't be reached right now. Try again in a few minutes.",
    ]);

    partake.status = 200;
    partake.events = [partakeEvent()];
    expect((await page(56133)).status).toBe(200);

    partake.status = 500;
    at(10 * 60);
    expect((await page(56133)).status).toBe(200);
    at(61 * 60);
    expect((await page(56133)).status).toBe(502);
  });
});
