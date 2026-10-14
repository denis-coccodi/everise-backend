import request from 'supertest';
import {app, clearDb, clock, files, jobs, relays} from '../utils';
import {
  SOURCES,
  discordFile,
  discordMessage,
  fashionReport,
  islandSeason,
} from '../utils/discord-messages';

const PNG = {type: 'image/png', bytes: new Uint8Array([137, 80, 78, 71, 1])};

// Wednesday of the week starting with Tuesday 13 October's reset.
const NOW = '2026-10-14T12:00:00Z';

beforeEach(async () => {
  await clearDb();
  clock.now = new Date(NOW);
  relays.channels.weekly = [];
  relays.status = 200;
  relays.pictures = {};
  relays.downloads = [];
});

afterAll(() => {
  clock.now = undefined;
});

const weekly = async () => (await request(app).get('/api/weekly')).body;

// The cron trigger's run.
const read = () => jobs.readRelays!();

describe('GET /api/weekly', () => {
  test('before anything is read: the resets, and no posts', async () => {
    const response = await request(app).get('/api/weekly');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(response.body).toEqual({
      available: true,
      resets: {
        daily: '2026-10-14T15:00:00.000Z',
        weekly: '2026-10-20T08:00:00.000Z',
        grandCompany: '2026-10-14T20:00:00.000Z',
      },
      fashionReport: null,
      nextJudgingAt: '2026-10-16T08:00:00.000Z',
      islandSanctuary: null,
    });
  });

  test('the resets turn over at their hour', async () => {
    clock.now = new Date('2026-10-20T08:00:00Z');
    expect((await weekly()).resets).toEqual({
      daily: '2026-10-20T15:00:00.000Z',
      weekly: '2026-10-27T08:00:00.000Z',
      grandCompany: '2026-10-20T20:00:00.000Z',
    });

    clock.now = new Date('2026-10-16T08:00:00Z');
    expect((await weekly()).nextJudgingAt).toBe('2026-10-23T08:00:00.000Z');
  });

  test('the latest Fashion Report and Island Sanctuary season, with their days', async () => {
    relays.pictures[discordFile('1001').split('?')[0]] = PNG;
    relays.pictures[discordFile('1002').split('?')[0]] = PNG;
    relays.channels.weekly = [
      fashionReport('2026-10-02T15:19:24Z', 453, discordFile('1001')),
      islandSeason('2026-10-06T08:27:39Z', 216),
      fashionReport('2026-10-09T13:02:34Z', 454, discordFile('1002')),
      islandSeason('2026-10-13T08:44:06Z', 217),
      // Members' own messages aren't shown.
      discordMessage({at: '2026-10-13T09:00:00Z', content: 'hello'}),
    ];

    await read();
    const body = await weekly();

    expect(relays.headers.at(-1)).toEqual({Authorization: 'Bot bot-token'});
    expect(body.fashionReport).toEqual({
      message: expect.objectContaining({
        postedAt: '2026-10-09T13:02:34.000Z',
        sourceGuildId: SOURCES.fashionReport,
        sourceName: 'Fashion Reporter #fashion-report-infographics',
        content: '',
      }),
      validFrom: '2026-10-09T08:00:00.000Z',
      validUntil: '2026-10-13T08:00:00.000Z',
    });
    expect(body.fashionReport.message.embeds[0]).toEqual({
      type: 'rich',
      url: 'https://fashionreportxiv.com/',
      title: 'Fashion Report Week 454 - Full Details',
      fields: [],
      // Discord's link expires: the picture is ours.
      image: {
        url: discordFile('1002'),
        file: '1002.png',
        width: 1701,
        height: 957,
      },
      // Imgur's stays linked.
      thumbnail: {url: 'https://i.imgur.com/LQtX3AS.png', width: 42},
    });
    expect(body.islandSanctuary).toEqual({
      message: expect.objectContaining({
        content: '@Squawkbox *SQUAAAAAWK*',
        embeds: [
          expect.objectContaining({
            title: 'Season 217 (Oct 13 - 19) Recommendations',
            color: 2067276,
            fields: [
              {
                name: 'Cycle 1',
                value: ':zzz: Always Rest :zzz:',
                inline: false,
              },
              expect.objectContaining({name: 'Cycle 2', inline: true}),
            ],
          }),
          expect.objectContaining({timestamp: '2026-10-13T08:00:14.679Z'}),
        ],
      }),
      validFrom: '2026-10-13T08:00:00.000Z',
      validUntil: '2026-10-20T08:00:00.000Z',
    });

    // No history: last week's Fashion Report and its picture are gone.
    expect(files.files.has('relays/1001.png')).toBe(false);

    const picture = await request(app).get('/api/relays/images/1002.png');
    expect(picture.status).toBe(200);
    expect(picture.headers['content-type']).toBe('image/png');
    expect(picture.headers['cache-control']).toContain('immutable');
    expect(new Uint8Array(picture.body)).toEqual(PNG.bytes);
  });

  test("a Fashion Report picture from elsewhere is copied too: the site's address shows the current week's", async () => {
    relays.pictures['https://fashionreportxiv.com/hint.png'] = PNG;
    relays.channels.weekly = [
      fashionReport(
        '2026-10-09T11:05:51Z',
        454,
        'https://fashionreportxiv.com/hint.png',
      ),
    ];

    await read();

    const {image, thumbnail} = (await weekly()).fashionReport.message.embeds[0];
    expect(image.file).toMatch(/^\d+-[a-z0-9]+\.png$/);
    expect(thumbnail.file).toBeUndefined();
    expect(
      (await request(app).get(`/api/relays/images/${image.file}`)).status,
    ).toBe(200);
  });

  test('a picture that cannot be copied keeps its link', async () => {
    relays.channels.weekly = [
      fashionReport('2026-10-09T13:02:34Z', 454, discordFile('1003')),
    ];

    await read();

    const {image} = (await weekly()).fashionReport.message.embeds[0];
    expect(image).toEqual(expect.objectContaining({url: discordFile('1003')}));
    expect(image.file).toBeUndefined();
  });

  test('messages are read once; an edit is read again, its old picture deleted', async () => {
    relays.pictures[discordFile('1004').split('?')[0]] = PNG;
    relays.pictures[discordFile('1005').split('?')[0]] = PNG;
    const report = fashionReport(
      '2026-10-09T13:02:34Z',
      454,
      discordFile('1004'),
    );
    relays.channels.weekly = [report];
    await read();
    await read();
    expect(relays.downloads).toHaveLength(1);

    relays.channels.weekly = [
      {
        ...report,
        edited_timestamp: '2026-10-09T14:00:00+00:00',
        embeds: [
          {...(report.embeds[0] as object), image: {url: discordFile('1005')}},
        ],
      },
    ];
    await read();

    const {message} = (await weekly()).fashionReport;
    expect(message.editedAt).toBe('2026-10-09T14:00:00.000Z');
    expect(message.embeds[0].image.file).toBe('1005.png');
    expect(files.files.has('relays/1004.png')).toBe(false);
    expect(files.files.has('relays/1005.png')).toBe(true);
  });

  test("a message that isn't shown is looked at once, edited or not", async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    relays.channels.weekly = [
      discordMessage({
        at: '2026-10-13T09:00:00Z',
        content: 'hello',
        editedAt: '2026-10-13T09:01:00+00:00',
      }),
    ];

    await read();
    await read();

    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  test('a message deleted in Discord is deleted, with its picture', async () => {
    relays.pictures[discordFile('1006').split('?')[0]] = PNG;
    const older = islandSeason('2026-10-06T08:27:39Z', 216);
    const report = fashionReport(
      '2026-10-09T13:02:34Z',
      454,
      discordFile('1006'),
    );
    relays.channels.weekly = [older, report];
    await read();

    relays.channels.weekly = [older];
    await read();

    expect((await weekly()).fashionReport).toBeNull();
    expect(files.files.has('relays/1006.png')).toBe(false);
  });

  test("weeks past are dropped: a season three weeks old isn't kept", async () => {
    relays.channels.weekly = [islandSeason('2026-09-22T08:29:22Z', 214)];
    await read();
    expect((await weekly()).islandSanctuary).toBeNull();
  });

  test('while Discord fails, what was read stays', async () => {
    relays.channels.weekly = [islandSeason('2026-10-13T08:44:06Z', 217)];
    await read();
    relays.status = 503;

    await expect(read()).resolves.toBeUndefined();

    expect((await weekly()).islandSanctuary).not.toBeNull();
  });
});

describe('GET /api/relays/images/:file', () => {
  test.each(['nothing.png', '1002.exe', '..%2Fmedia%2F1.png'])(
    '%s: 404',
    async file => {
      const response = await request(app).get(`/api/relays/images/${file}`);
      expect(response.status).toBe(404);
    },
  );
});
