import request from 'supertest';
import {app, clearDb, clock, files, jobs, relays} from '../utils';
import {SOURCES, discordFile, huntTrain} from '../utils/discord-messages';

const WEBP = {type: 'image/webp', bytes: new Uint8Array([82, 73, 70, 70])};
const NOW = '2026-10-14T13:00:00Z';

beforeAll(() => {
  // Messages not shown, and Discord failing, are logged.
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

beforeEach(async () => {
  await clearDb();
  clock.now = new Date(NOW);
  relays.channels.hunts = [];
  relays.status = 200;
  relays.pictures = {};
  relays.downloads = [];
});

afterAll(() => {
  clock.now = undefined;
  jest.restoreAllMocks();
});

const hunts = async (query = '') =>
  (await request(app).get(`/api/hunts${query}`)).body;
const worlds = (body: {posts: {message: {content: string}}[]}) =>
  body.posts.map(post => /\[(\w+)\]/.exec(post.message.content)?.[1]);

// The cron trigger's run.
const read = () => jobs.readRelays!();

describe('GET /api/hunts', () => {
  test("the hunt trains, the latest start first, with their data centre; other servers' aren't shown", async () => {
    relays.channels.hunts = [
      huntTrain('2026-10-14T11:30:41Z', SOURCES.centurioHunts, 'Phoenix'),
      huntTrain('2026-10-14T11:13:13Z', SOURCES.chaosHunts, 'Omega'),
      huntTrain('2026-10-14T12:05:46Z', SOURCES.unknown, 'Nowhere'),
      huntTrain('2026-10-14T12:44:43Z', SOURCES.centurioHunts, 'Shiva', {
        embeds: [
          {
            type: 'gifv',
            url: 'https://tenor.com/view/zenitsu-gif-22075861',
            thumbnail: {
              url: 'https://media1.tenor.com/m/Gl9q/zenitsu.gif',
              width: 498,
              height: 326,
            },
            video: {url: 'https://media.tenor.com/Gl9q/zenitsu.mp4'},
          },
        ],
      }),
    ];

    await read();
    const response = await request(app).get('/api/hunts');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(response.body.available).toBe(true);
    // The data centre that isn't the game's is left out.
    expect(response.body.dataCentres).toEqual(['Light', 'Chaos']);
    expect(worlds(response.body)).toEqual(['Shiva', 'Phoenix', 'Omega']);
    const [shiva] = response.body.posts;
    const startsAt = '2026-10-14T12:54:43.000Z';
    expect(shiva).toEqual({
      dataCentre: 'Light',
      // The time in its text.
      startsAt,
      message: {
        id: expect.any(String),
        postedAt: '2026-10-14T12:44:43.000Z',
        sourceGuildId: SOURCES.centurioHunts,
        sourceName: 'Centurio Hunts (FFXIV) #🚆│light-train-relay',
        // As Discord has it: the site shows the emoji and times.
        content: `@EWTrain **[Shiva]** Hunt train starting <t:${Date.parse(startsAt) / 1000}:R> at <:aetheryte:866773648450519082> ***Anagnorisis – Elpis***`,
        embeds: [
          {
            type: 'gifv',
            url: 'https://tenor.com/view/zenitsu-gif-22075861',
            fields: [],
            // Tenor's stay linked.
            thumbnail: {
              url: 'https://media1.tenor.com/m/Gl9q/zenitsu.gif',
              width: 498,
              height: 326,
            },
            video: {url: 'https://media.tenor.com/Gl9q/zenitsu.mp4'},
          },
        ],
        attachments: [],
      },
    });
    expect(relays.downloads).toEqual([]);

    expect(worlds(await hunts('?dataCentre=Chaos'))).toEqual(['Omega']);
  });

  test('a data centre the game does not have: 422', async () => {
    const response = await request(app).get('/api/hunts?dataCentre=Nowhere');

    expect(response.status).toBe(422);
    expect(response.body.errors.body[0]).toContain(
      "Pick one of the game's data centres",
    );
  });

  test('pictures on Discord are copied, and deleted with the last train that has them', async () => {
    const map = discordFile('2001', 'Lakeland.webp');
    relays.pictures[map.split('?')[0]] = WEBP;
    const withMap = (at: string, world: string) =>
      huntTrain(at, SOURCES.centurioHunts, world, {
        embeds: [{type: 'image', thumbnail: {url: map}}],
      });
    // Both long over: only the last one that started is kept, with the
    // picture they share.
    relays.channels.hunts = [
      withMap('2026-10-14T00:35:11Z', 'Twintania'),
      withMap('2026-10-14T00:36:14Z', 'Zodiark'),
    ];
    await read();

    const {posts} = await hunts();
    expect(worlds({posts})).toEqual(['Zodiark']);
    expect(posts[0].message.embeds[0].thumbnail.file).toBe('2001.webp');
    expect(files.files.has('relays/2001.webp')).toBe(true);

    // A newer train has started: Zodiark's is past, and its picture goes.
    relays.channels.hunts.push(
      huntTrain('2026-10-14T12:30:00Z', SOURCES.centurioHunts, 'Shiva'),
    );
    await read();

    expect(worlds(await hunts())).toEqual(['Shiva']);
    expect(files.files.has('relays/2001.webp')).toBe(false);
  });

  test('at most 10 new messages are kept a read; the rest the next time', async () => {
    relays.channels.hunts = Array.from({length: 13}, (_, i) =>
      huntTrain(
        `2026-10-14T12:${String(i).padStart(2, '0')}:00Z`,
        SOURCES.centurioHunts,
        `World${i}`,
      ),
    );

    await read();
    expect((await hunts()).posts).toHaveLength(10);

    await read();
    expect((await hunts()).posts).toHaveLength(13);
    expect(worlds(await hunts())[0]).toBe('World12');
  });

  test('no history: per data centre, the trains to come, those running, and the last that started', async () => {
    relays.channels.hunts = [
      // Starts 09:10: long over.
      huntTrain('2026-10-14T09:00:00Z', SOURCES.centurioHunts, 'Over'),
      // No time in its text: it starts when posted, 10:00.
      huntTrain('2026-10-14T10:00:00Z', SOURCES.centurioHunts, 'Untimed', {
        content: '@EWTrain **[Untimed]** train starting right after ShB',
      }),
      // Starts 11:40: still running at 13:00.
      huntTrain('2026-10-14T11:30:00Z', SOURCES.centurioHunts, 'Running'),
      // Starts 13:05.
      huntTrain('2026-10-14T12:55:00Z', SOURCES.centurioHunts, 'Coming'),
      // Chaos's only train, over: the last that started there.
      huntTrain('2026-10-14T08:00:00Z', SOURCES.chaosHunts, 'ChaosLast'),
      // More than a day old: not even kept on a first read.
      huntTrain('2026-10-13T11:00:00Z', SOURCES.chaosHunts, 'Yesterday'),
    ];

    await read();

    expect(worlds(await hunts())).toEqual(['Coming', 'Running', 'ChaosLast']);

    // Two and a half hours on: Running is over, but the last that started.
    clock.now = new Date('2026-10-14T15:30:00Z');
    await read();
    expect(worlds(await hunts())).toEqual(['Coming', 'ChaosLast']);
  });
});
