import 'jest-extended';
import request from 'supertest';
import {createApp} from '../../src/app';
import {SqlDocumentStore} from '../../src/db';
import {app, clock, discord, usersClient, xivpf, xivpfEntry} from '../utils';
import {SqliteStorage} from '../utils/sqlite-storage';

// The first entry's id, as the board names it: <server restart>-<id>.
const LISTING = '1789630212-1';

// Each test starts an hour after the last, so the board reads xivpf again.
let start = Date.parse('2026-10-09T18:00:00Z');
let token: string;

beforeAll(async () => {
  ({
    user: {token},
  } = await usersClient.registerRandomUser());
});

beforeEach(() => {
  start += 3_600_000;
  clock.now = new Date(start);
  xivpf.status = 200;
  xivpf.body = undefined;
  xivpf.listings = [xivpfEntry()];
  discord.sent = [];
  discord.webhookStatus = 204;
});

afterAll(() => {
  clock.now = undefined;
});

const share = (path: string, body: object, as: string | null = token) => {
  const req = request(app).post(`/api/party-finder/${path}`).send(body);
  return as ? req.set('authorization', `Token ${as}`) : req;
};

describe('POST /api/party-finder/posts', () => {
  test('posts the listing as it is now, with the words, staying on the site', async () => {
    const response = await share('posts', {
      dataCentre: 'Light',
      listingId: LISTING,
      comment: '  Come prog with us!  ',
    });

    expect(response.status).toBe(201);
    const {article} = response.body;
    expect(article).toMatchObject({
      title: 'Party Finder: The Unending Coil of Bahamut (Ultimate)',
      description: 'Odin (Light) · 2 players needed',
      body: 'Come prog with us!',
      tagList: ['party-finder'],
      partyFinder: {
        dataCentre: 'Light',
        icons: {tank: 62581, healer: 62582, dps: 62583, beginner: 61523},
        listing: {
          id: LISTING,
          recruiter: 'Tataru Taru',
          world: {id: 66, name: 'Odin'},
          duty: 'The Unending Coil of Bahamut (Ultimate)',
        },
      },
    });
    expect(discord.sent).toEqual([]);
  });

  test('also announces it in Discord when asked, with the listing and the words', async () => {
    const response = await share('posts', {
      dataCentre: 'Light',
      listingId: LISTING,
      comment: 'Join us',
      shareToDiscord: true,
    });

    expect(response.status).toBe(201);
    expect(discord.sent).toHaveLength(1);
    const [{body}] = discord.sent;
    expect(body.content).toMatch(/shared a Party Finder listing\n> Join us$/);
    expect(body).toMatchObject({
      allowed_mentions: {parse: []},
      embeds: [
        {
          title: 'The Unending Coil of Bahamut (Ultimate)',
          url: expect.stringMatching(/\/article\//),
          description: 'Prog from P3, know the mechanics',
          thumbnail: {url: expect.stringMatching(/\/api\/images\/61802$/)},
        },
      ],
    });
    const fields = (
      body.embeds as {fields: {name: string; value: string}[]}[]
    )[0].fields;
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: 'Recruiter',
        value: 'Tataru Taru · Shiva',
      }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({name: 'Location', value: 'Odin (Light)'}),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({name: 'Players needed', value: '2'}),
    );
  });

  test("a listing that's gone, a guest, or a second share too soon is refused", async () => {
    const gone = await share('posts', {dataCentre: 'Light', listingId: 'x'});
    expect(gone.status).toBe(404);
    expect(gone.body.errors.body).toEqual([
      'That listing has ended or filled up. Pick another one.',
    ]);

    const guest = await share(
      'posts',
      {dataCentre: 'Light', listingId: LISTING},
      null,
    );
    expect(guest.status).toBe(401);

    expect(
      (await share('posts', {dataCentre: 'Light', listingId: LISTING})).status,
    ).toBe(201);
    const again = await share('posts', {
      dataCentre: 'Light',
      listingId: LISTING,
    });
    expect(again.status).toBe(429);
    expect(again.headers['retry-after']).toBe('15');
  });

  test('the words have a limit, and the data centre must be real', async () => {
    const response = await share('posts', {
      dataCentre: 'Nowhere',
      listingId: LISTING,
      comment: 'x'.repeat(281),
    });

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual(
      expect.arrayContaining(['Keep the message to 280 characters.']),
    );
  });
});

describe('POST /api/party-finder/discord', () => {
  test('sends the listing to the channel only, linking to its data centre', async () => {
    const response = await share('discord', {
      dataCentre: 'Light',
      listingId: LISTING,
      comment: 'Anyone?',
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({shared: true});
    expect(discord.sent).toHaveLength(1);
    const [{body}] = discord.sent;
    expect(body.content).toMatch(/\n> Anyone\?$/);
    expect(
      (body.embeds as {url: string}[])[0].url.endsWith('/party-finder/light'),
    ).toBe(true);
    // No post was made.
    const feed = await request(app).get('/api/articles?tag=party-finder');
    expect(
      feed.body.articles.filter((a: {body: string}) => a.body === 'Anyone?'),
    ).toEqual([]);
  });

  test('once a minute per member, and only for members', async () => {
    expect(
      (await share('discord', {dataCentre: 'Light', listingId: LISTING}))
        .status,
    ).toBe(202);

    const again = await share('discord', {
      dataCentre: 'Light',
      listingId: LISTING,
    });
    expect(again.status).toBe(429);
    expect(again.headers['retry-after']).toBe('60');

    const guest = await share(
      'discord',
      {dataCentre: 'Light', listingId: LISTING},
      null,
    );
    expect(guest.status).toBe(401);
  });

  test('says so when Discord refuses the message', async () => {
    discord.webhookStatus = 500;

    const response = await share('discord', {
      dataCentre: 'Light',
      listingId: LISTING,
    });

    expect(response.status).toBe(502);
    expect(response.body.errors.body).toEqual([
      "Discord didn't take the message. Try again in a minute.",
    ]);
  });

  test("isn't offered without a webhook", async () => {
    const site = createApp(
      new SqlDocumentStore(new SqliteStorage()),
      undefined,
      undefined,
      undefined,
      {discord: {webhookUrl: undefined}},
    );

    const available = await request(site).get('/api/discord/sharing');
    expect(available.body).toEqual({available: false});
    expect((await request(app).get('/api/discord/sharing')).body).toEqual({
      available: true,
    });
  });
});
