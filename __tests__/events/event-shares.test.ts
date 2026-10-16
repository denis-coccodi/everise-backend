import 'jest-extended';
import request from 'supertest';
import {createApp} from '../../src/app';
import {SqlDocumentStore} from '../../src/db';
import {
  app,
  clock,
  discord,
  partake,
  partakeEvent,
  usersClient,
} from '../utils';
import {SqliteStorage} from '../utils/sqlite-storage';

const ID = 56133;
const HOUR = 3_600_000;

// Each test starts two hours after the last, so nothing read before is
// kept (events are read every five minutes, kept an hour) and each
// member's minute between shares has passed.
let start = Date.parse('2026-10-16T18:00:00Z');
let token: string;

beforeAll(async () => {
  ({
    user: {token},
  } = await usersClient.registerRandomUser());
});

beforeEach(() => {
  start += 2 * HOUR;
  clock.now = new Date(start);
  partake.status = 200;
  partake.events = [partakeEvent()];
  partake.queries = [];
  discord.sent = [];
  discord.webhookStatus = 204;
});

afterAll(() => {
  clock.now = undefined;
});

const share = (body: object, as: string | null = token) => {
  const req = request(app).post('/api/events/discord').send(body);
  return as ? req.set('authorization', `Token ${as}`) : req;
};
const seconds = (offsetHours: number) =>
  Math.floor((start + offsetHours * HOUR) / 1000);

describe('POST /api/events/discord', () => {
  test('sends the event to the channel with the words, linking to its page here', async () => {
    const response = await share({eventId: ID, comment: 'Who is coming?'});

    expect(response.status).toBe(202);
    expect(response.body).toEqual({shared: true});
    expect(discord.sent).toHaveLength(1);
    const [{body}] = discord.sent;
    expect(body.content).toMatch(/shared an event\n> Who is coming\?$/);
    expect(body.allowed_mentions).toEqual({parse: []});
    const [embed] = body.embeds as Record<string, unknown>[];
    expect(embed).toMatchObject({
      title: 'CLUB NOIR- RSVP',
      description: 'Tonight Bring a date and dance the night away.',
      image: {
        url: 'https://cdn.partake.gg/assets/4edcfd0b403b4e5db1044f18e5f50fac.webp',
      },
      footer: {text: 'Everise Events · Chaos · listed on Partake'},
    });
    // The event's page on the site; opening it from Discord asks for sign-in.
    expect(embed.url as string).toEndWith(`/events/${ID}?from=discord`);
    expect(embed.fields).toEqual([
      {
        name: 'When',
        value: `<t:${seconds(2)}:F> (<t:${seconds(2)}:R>), until <t:${seconds(6)}:t>`,
        inline: false,
      },
      {
        name: 'Where',
        value: 'Omega, Empyreum, Ward 30, Plot 52 (Chaos)',
        inline: false,
      },
      {name: 'Hosted by', value: 'Club Noir', inline: true},
      {name: 'Rated', value: 'Mature', inline: true},
      {name: 'What', value: 'Bars & Lounges · Live DJs', inline: false},
    ]);
  });

  test('says an event is going on now, and labels only MATURE ones', async () => {
    partake.events = [partakeEvent({ageRating: 'EVERYONE', team: null}, -1)];

    await share({eventId: ID});

    const [embed] = discord.sent[0].body.embeds as Record<string, unknown>[];
    expect(embed.fields).toEqual([
      {name: 'Going on now', value: `Until <t:${seconds(3)}:t>`, inline: false},
      expect.objectContaining({name: 'Where'}),
      expect.objectContaining({name: 'What'}),
    ]);
  });

  test('once a minute per member, only for members, and only events the site shows', async () => {
    expect((await share({eventId: ID})).status).toBe(202);

    const again = await share({eventId: ID});
    expect(again.status).toBe(429);
    expect(again.headers['retry-after']).toBe('60');
    expect(again.body.errors.body).toEqual([
      'You can share another event in 60 seconds.',
    ]);

    expect((await share({eventId: ID}, null)).status).toBe(401);

    clock.now = new Date(start + 2 * 60_000);
    partake.events = [partakeEvent({id: 7, ageRating: 'ADULT'})];
    const adult = await share({eventId: 7});
    expect(adult.status).toBe(404);
    expect(adult.body.errors.body).toEqual([
      "That event isn't listed here: it may have been removed from Partake, or isn't one the site shows. Find another on the Events page.",
    ]);
    expect(discord.sent).toHaveLength(1);
  });

  test("won't share an event that is over", async () => {
    partake.events = [partakeEvent({}, -10)];

    const response = await share({eventId: ID});

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'That event is over: share one that is still to come.',
    ]);
    expect(discord.sent).toEqual([]);
  });

  test('checks the event and the words', async () => {
    const long = await share({eventId: ID, comment: 'a'.repeat(281)});
    expect(long.status).toBe(422);
    expect(long.body.errors.body).toEqual([
      'Keep the message to 280 characters.',
    ]);

    for (const eventId of ['56133', 0, 1.5, undefined]) {
      const response = await share({eventId});
      expect(response.status).toBe(422);
      expect(response.body.errors.body).toEqual([
        "That isn't an event's number.",
      ]);
    }
  });

  test("says so when Discord refuses the message, Partake can't be reached, or sharing isn't set up", async () => {
    discord.webhookStatus = 500;
    const refused = await share({eventId: ID});
    expect(refused.status).toBe(502);
    expect(refused.body.errors.body).toEqual([
      "Discord didn't take the message. Try again in a minute.",
    ]);

    clock.now = new Date(start + 2 * 60_000);
    partake.status = 503;
    const down = await share({eventId: 99});
    expect(down.status).toBe(502);
    expect(down.body.errors.body).toEqual([
      "The events can't be reached right now. Try again in a few minutes.",
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
          username: 'event-sharer',
          email: 'event-sharer@example.test',
          password: 'Event-sharer-2026',
        },
      });
    const unavailable = await request(site)
      .post('/api/events/discord')
      .set('authorization', `Token ${signedUp.body.user.token as string}`)
      .send({eventId: ID});
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.errors.body).toEqual([
      "Sharing to the Everise Discord isn't set up on this site.",
    ]);
  });
});
