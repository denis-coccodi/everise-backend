import 'jest-extended';
import request from 'supertest';
import {createApp} from '../../src/app';
import {SqlDocumentStore} from '../../src/db';
import {
  app,
  clock,
  discord,
  ffxivVenue,
  ffxivVenues,
  usersClient,
} from '../utils';
import {SqliteStorage} from '../utils/sqlite-storage';

const ID = '03SsBX8Q1dkl';
const HOUR = 3_600_000;

// Each test starts two hours after the last, so nothing read before is
// kept (venues are read every five minutes, kept an hour).
let start = Date.parse('2026-10-15T18:00:00Z');
let token: string;

beforeAll(async () => {
  ({
    user: {token},
  } = await usersClient.registerRandomUser());
});

beforeEach(() => {
  start += 2 * HOUR;
  clock.now = new Date(start);
  ffxivVenues.status = 200;
  ffxivVenues.venues = {Light: [ffxivVenue()]};
  ffxivVenues.requests = [];
  discord.sent = [];
  discord.webhookStatus = 204;
});

afterAll(() => {
  clock.now = undefined;
});

const page = (id = ID) => request(app).get(`/api/venues/${id}`);
const share = (body: object, as: string | null = token) => {
  const req = request(app).post('/api/venues/discord').send(body);
  return as ? req.set('authorization', `Token ${as}`) : req;
};
const iso = (offsetHours: number) =>
  new Date(start + offsetHours * HOUR).toISOString();

// One of a venue's openings as FFXIV Venues sends it: the next one `opensIn`
// hours from now, for four hours.
function scheduled(
  intervalType: number,
  intervalArgument: number,
  opensIn: number,
) {
  return {
    day: 4,
    interval: {intervalType, intervalArgument},
    resolution: {
      start: iso(opensIn),
      end: iso(opensIn + 4),
      isNow: false,
      isWithinWeek: opensIn < 168,
    },
  };
}

describe('GET /api/venues/:id', () => {
  test('shows the venue, its next opening and its regular openings, for everyone', async () => {
    ffxivVenues.venues = {
      Light: [
        ffxivVenue({
          schedule: [
            scheduled(1, -1, 200),
            scheduled(0, 1, 2),
            scheduled(0, 2, 26),
            // A kind of repeat the page doesn't know: left out.
            scheduled(7, 1, 50),
          ],
        }),
      ],
    };

    const response = await page();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(ffxivVenues.requests).toEqual([
      `https://api.ffxivvenues.com/v1/venue/${ID}`,
    ]);
    expect(response.body.venue).toStrictEqual({
      id: ID,
      name: 'The Heretic Knight',
      description: ['An Ishgardian tavern.', 'Memories last.'],
      banner: 'https://images.ffxivvenues.com/03SsBX8Q1dkl/KqB9nR35lgH2',
      world: 'Shiva',
      address: 'Goblet, Ward 25 (subdivision), Plot 48',
      tags: ['Tavern', 'Drink'],
      website: 'https://hereticknight.carrd.co/',
      discord: 'https://discord.gg/CJDxHSSWWC',
      url: `https://ffxivvenues.com/venue/${ID}`,
      notices: [],
      dataCentre: 'Light',
      nextOpening: {opensAt: iso(2), closesAt: iso(6), openNow: false},
      schedule: [
        {opensAt: iso(2), closesAt: iso(6), repeat: {every: 'weeks', weeks: 1}},
        {
          opensAt: iso(26),
          closesAt: iso(30),
          repeat: {every: 'weeks', weeks: 2},
        },
        {
          opensAt: iso(200),
          closesAt: iso(204),
          repeat: {every: 'month', week: -1},
        },
      ],
    });
  });

  test('has a page for a venue closed for a while, without a next opening', async () => {
    ffxivVenues.venues = {Light: [ffxivVenue({resolution: null})]};

    const response = await page();

    expect(response.status).toBe(200);
    expect(response.body.venue.nextOpening).toBeNull();
  });

  test("404s for a venue the site doesn't show, or FFXIV Venues doesn't have", async () => {
    ffxivVenues.venues = {
      Light: [
        ffxivVenue({id: 'nsfw', sfw: false}),
        ffxivVenue({id: 'unapproved', approved: false}),
      ],
    };

    for (const id of ['nsfw', 'unapproved', 'nowhere']) {
      const response = await page(id);
      expect(response.status).toBe(404);
      expect(response.body.errors.body).toEqual([
        "That venue isn't listed here: it may have closed for good, or isn't one the site shows. Find another on the Venues page.",
      ]);
    }
  });

  test('reads a venue at most every five minutes; when FFXIV Venues is down, keeps it an hour, then 502', async () => {
    await page();
    clock.now = new Date(start + 4 * 60_000);
    await page();
    expect(ffxivVenues.requests).toHaveLength(1);

    ffxivVenues.status = 503;
    clock.now = new Date(start + 30 * 60_000);
    const stale = await page();
    expect(stale.status).toBe(200);
    expect(ffxivVenues.requests).toHaveLength(2);

    clock.now = new Date(start + 61 * 60_000);
    const gone = await page();
    expect(gone.status).toBe(502);
    expect(gone.body.errors.body).toEqual([
      "The venues can't be reached right now. Try again in a few minutes.",
    ]);
  });
});

describe('POST /api/venues/discord', () => {
  test('sends the venue to the channel with the words, linking to its page here', async () => {
    const response = await share({venueId: ID, comment: 'Drinks tonight?'});

    expect(response.status).toBe(202);
    expect(response.body).toEqual({shared: true});
    expect(discord.sent).toHaveLength(1);
    const [{body}] = discord.sent;
    expect(body.content).toMatch(/shared a venue\n> Drinks tonight\?$/);
    expect(body.allowed_mentions).toEqual({parse: []});
    const [embed] = body.embeds as Record<string, unknown>[];
    expect(embed).toMatchObject({
      title: 'The Heretic Knight',
      description: 'An Ishgardian tavern.',
      image: {url: 'https://images.ffxivvenues.com/03SsBX8Q1dkl/KqB9nR35lgH2'},
    });
    // The venue's page on the site; opening it from Discord asks for sign-in.
    expect((embed.url as string).endsWith(`/venues/${ID}?from=discord`)).toBe(
      true,
    );
    const opens = Math.floor((start + 2 * HOUR) / 1000);
    expect(embed.fields).toEqual([
      {
        name: 'Where',
        value: 'Shiva, Goblet, Ward 25 (subdivision), Plot 48 (Light)',
        inline: false,
      },
      {
        name: 'Next open',
        value: `<t:${opens}:F> (<t:${opens}:R>)`,
        inline: false,
      },
      {name: 'Offers', value: 'Tavern · Drink', inline: false},
    ]);
  });

  test('once a minute per member, only for members, and only venues the site shows', async () => {
    expect((await share({venueId: ID})).status).toBe(202);

    const again = await share({venueId: ID});
    expect(again.status).toBe(429);
    expect(again.headers['retry-after']).toBe('60');
    expect(again.body.errors.body).toEqual([
      'You can share another venue in 60 seconds.',
    ]);

    expect((await share({venueId: ID}, null)).status).toBe(401);

    clock.now = new Date(start + 2 * 60_000);
    ffxivVenues.venues = {Light: [ffxivVenue({id: 'nsfw', sfw: false})]};
    expect((await share({venueId: 'nsfw'})).status).toBe(404);
    expect(discord.sent).toHaveLength(1);
  });

  test('the words have a limit', async () => {
    const response = await share({venueId: ID, comment: 'a'.repeat(281)});

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'Keep the message to 280 characters.',
    ]);
  });

  test("says so when Discord refuses the message, or sharing isn't set up", async () => {
    discord.webhookStatus = 500;
    const refused = await share({venueId: ID});
    expect(refused.status).toBe(502);
    expect(refused.body.errors.body).toEqual([
      "Discord didn't take the message. Try again in a minute.",
    ]);

    const site = createApp(
      new SqlDocumentStore(new SqliteStorage()),
      undefined,
      () => clock.now!,
      undefined,
      {discord: {webhookUrl: undefined}},
    );
    const signedUp = await request(site)
      .post('/api/users')
      .send({
        user: {
          username: 'venue-sharer',
          email: 'venue-sharer@example.test',
          password: 'Venue-sharer-2026',
        },
      });
    const other = signedUp.body.user.token as string;
    const unavailable = await request(site)
      .post('/api/venues/discord')
      .set('authorization', `Token ${other}`)
      .send({venueId: ID});
    expect(unavailable.status).toBe(503);
  });
});
