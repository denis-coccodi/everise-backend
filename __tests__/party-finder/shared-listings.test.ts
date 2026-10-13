import request from 'supertest';
import {
  app,
  clock,
  discord,
  jobs,
  usersClient,
  xivpf,
  xivpfEntry,
} from '../utils';

const LISTING = 'light-1789630212-1';
const TITLE = 'The Unending Coil of Bahamut (Ultimate)';

// Each test starts 4 hours after the last (whose checks run up to 3 hours
// on), so the board reads xivpf again.
let start = Date.parse('2026-10-14T18:00:00Z');
const at = (seconds: number) => (clock.now = new Date(start + seconds * 1000));

let member: {token: string; username: string};

beforeAll(async () => {
  ({user: member} = await usersClient.registerRandomUser());
});

beforeEach(() => {
  start += 4 * 3_600_000;
  at(0);
  xivpf.status = 200;
  xivpf.body = undefined;
  xivpf.listings = [xivpfEntry()];
  discord.sent = [];
  discord.webhookStatus = 204;
});

afterAll(() => {
  clock.now = undefined;
});

const share = (path: 'posts' | 'discord', body: object = {}) =>
  request(app)
    .post(`/api/party-finder/${path}`)
    .set('authorization', `Token ${member.token}`)
    .send({dataCentre: 'Light', listingId: LISTING, ...body});

const notifications = async () =>
  (
    await request(app)
      .get('/api/notifications')
      .set('authorization', `Token ${member.token}`)
  ).body.notifications.filter((n: {type: string}) => n.type === 'pf-ended');

const discordTexts = () =>
  discord.sent.map(({body}) => (body as {content: string}).content);

// The cron trigger's run, a minute or more after the last read of xivpf.
async function check(seconds: number) {
  at(seconds);
  await jobs.checkSharedListings!();
}

describe('shared Party Finder listings that end', () => {
  test('one shared in the Discord: its sharer is told, and the channel, once it has been gone half an hour', async () => {
    expect((await share('discord')).status).toBe(202);
    const before = (await notifications()).length;

    // Still up: nothing.
    await check(70);
    expect(discordTexts()).toHaveLength(1);
    expect(await notifications()).toHaveLength(before);

    // Gone from the Party Finder, but not for long yet.
    xivpf.listings = [];
    await check(140);
    await check(29 * 60);
    expect(discordTexts()).toHaveLength(1);
    expect(await notifications()).toHaveLength(before);

    // Half an hour since it was last seen.
    await check(70 + 30 * 60);
    const [ended] = await notifications();
    expect(ended).toMatchObject({
      type: 'pf-ended',
      seen: false,
      read: false,
      actors: [],
      actorCount: 0,
      article: null,
      partyFinder: {listingId: LISTING, dataCentre: 'Light', title: TITLE},
    });
    const texts = discordTexts();
    expect(texts).toHaveLength(2);
    expect(texts[1]).toContain(`**${TITLE}** on Light, shared by`);
    expect(texts[1]).toContain('is no longer up');

    // Told once.
    await check(40 * 60);
    expect(discordTexts()).toHaveLength(2);
    expect(await notifications()).toHaveLength(before + 1);
  });

  test('one shared as a post: its sharer is told, linked to the post; the Discord only if it went there too', async () => {
    const quiet = await share('posts');
    xivpf.listings = [];
    await check(30 * 60);

    const [ended] = await notifications();
    expect(ended).toMatchObject({
      article: {id: quiet.body.article.id, title: TITLE},
      partyFinder: {listingId: LISTING},
    });
    expect(discordTexts()).toEqual([]);

    start += 3_600_000;
    at(0);
    xivpf.listings = [xivpfEntry()];
    await share('posts', {shareToDiscord: true});
    const announced = discordTexts().length;
    xivpf.listings = [];
    await check(30 * 60);
    expect(discordTexts()).toHaveLength(announced + 1);
    expect(discordTexts().at(-1)).toContain('is no longer up');
  });

  test('one reopened, or off the board a while, is watched until it closes, hours later', async () => {
    await share('discord');
    const before = (await notifications()).length;

    // Missing for 20 minutes, then back.
    xivpf.listings = [];
    await check(70);
    await check(20 * 60);
    at(25 * 60);
    xivpf.listings = [xivpfEntry()];
    await check(25 * 60);

    // Reopened again and again, well past the hour it first had.
    for (const minutes of [60, 110, 160]) {
      xivpf.listings = [];
      await check((minutes - 30) * 60);
      at(minutes * 60);
      xivpf.listings = [xivpfEntry()];
      await check(minutes * 60);
    }
    expect(await notifications()).toHaveLength(before);
    expect(discordTexts()).toHaveLength(1);

    // Closed for good, hours after it was shared.
    xivpf.listings = [];
    await check(175 * 60);
    expect(await notifications()).toHaveLength(before);
    await check(190 * 60);
    expect(await notifications()).toHaveLength(before + 1);
    expect(discordTexts()).toHaveLength(2);
  });

  test("decides nothing while the listings can't be read", async () => {
    const shared = await share('discord');
    expect(shared.body).toEqual({shared: true});
    xivpf.status = 503;
    const before = (await notifications()).length;

    // The last read is kept for 15 minutes; then nothing can be read, even
    // long after the listing's own time ran out.
    await check(16 * 60);
    await check(3 * 60 * 60);
    expect(await notifications()).toHaveLength(before);

    // Readable again, and the listing is gone: half an hour later, ended.
    xivpf.status = 200;
    xivpf.listings = [];
    await check(3 * 60 * 60 + 60);
    expect(await notifications()).toHaveLength(before + 1);
  });
});
