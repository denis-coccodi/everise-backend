import 'jest-extended';
import request from 'supertest';
import {config} from '../../src/config';
import {DiscordAnnouncer, DiscordFetch} from '../../src/discord';
import {ArticleEvent, LiveEvent} from '../../src/live/live-feed';
import {app, articlesClient, clock, discord, usersClient} from '../utils';

const site = config.baseUrl;

describe('announcing new posts in Discord', () => {
  beforeEach(() => {
    discord.sent = [];
    discord.webhookStatus = 204;
  });

  test('a new post is announced in the channel, linking back, pinging nobody', async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);

    expect(discord.sent).toHaveLength(1);
    const [{url, body}] = discord.sent;
    // wait=true: Discord answers once it's posted, so messages keep their order.
    expect(url).toBe('https://discord.test/api/webhooks/1/secret?wait=true');
    expect(body).toMatchObject({
      username: 'Everise',
      avatar_url: `${site}/assets/images/everise-crest.png`,
      allowed_mentions: {parse: []},
      embeds: [
        {
          title: article.title,
          url: `${site}/article/${article.id}`,
          author: {
            name: user.username,
            url: `${site}/profile/${encodeURIComponent(user.username)}`,
          },
          timestamp: article.createdAt,
        },
      ],
    });
    expect(body.content).toContain('New post by');
  });

  test('the post is saved even when Discord refuses', async () => {
    discord.webhookStatus = 500;
    const {user} = await usersClient.registerRandomUser();

    const response = await request(app)
      .post('/api/articles')
      .set('authorization', `Token ${user.token}`)
      .send({
        article: {
          title: 'Still here',
          description: 'd',
          body: 'b',
          tagList: [],
        },
      });

    expect(response.status).toBe(201);
    expect(discord.sent).toHaveLength(1);
  });
});

describe('DiscordAnnouncer', () => {
  const event = (article: Partial<ArticleEvent['article']>): LiveEvent => ({
    type: 'article-created',
    article: {
      id: expect.any(String),
      title: 'Duty Found',
      description: 'A roulette result',
      body: 'Body',
      media: [{kind: 'image', url: 'https://example.com/pic.png'}],
      tagList: [],
      createdAt: '2026-10-06T10:00:00.000Z',
      updatedAt: '2026-10-06T10:00:00.000Z',
      favorited: false,
      favoritesCount: 0,
      author: {
        id: expect.any(String),
        username: 'snek_lord',
        bio: null,
        image: 'https://site/a.png',
        following: false,
      },
      ...article,
    } as ArticleEvent['article'],
  });

  function announcer() {
    const sent: Record<string, unknown>[] = [];
    const fetchFn: DiscordFetch = async (_url, init) => {
      sent.push(JSON.parse(init!.body!));
      return {ok: true, status: 204, json: async () => ({})};
    };
    return {
      sent,
      announcer: new DiscordAnnouncer('https://hook', 'https://site', fetchFn),
    };
  }

  test("a roulette result shows the duty, the party and the duty's banner", async () => {
    const {sent, announcer: discordAnnouncer} = announcer();

    await discordAnnouncer.publish(
      event({
        roulette: {
          type: 'Dungeon',
          name: 'The Aurum Vale',
          detail: 'Level 47 · A Realm Reborn',
          mode: "Dealer's choice: Ninja",
          dutyUnknown: false,
          image: 112345,
          job: {name: 'Ninja', icon: 62030},
          guest: false,
        },
      }),
    );

    const [message] = sent as {
      content: string;
      embeds: Record<string, unknown>[];
    }[];
    // Markdown in names is escaped, so it shows as typed.
    expect(message.content).toBe('🎲 **snek\\_lord** spun the duty roulette!');
    expect(message.embeds[0]).toMatchObject({
      fields: [
        {name: 'Dungeon', value: 'The Aurum Vale', inline: true},
        {name: 'Details', value: 'Level 47 · A Realm Reborn', inline: true},
        {name: 'Party', value: "Dealer's choice: Ninja", inline: false},
      ],
      image: {url: 'https://site/api/images/112345'},
    });
  });

  test('a post shows its first image', async () => {
    const {sent, announcer: discordAnnouncer} = announcer();

    await discordAnnouncer.publish(event({}));

    expect((sent[0] as {embeds: {image: unknown}[]}).embeds[0].image).toEqual({
      url: 'https://example.com/pic.png',
    });
  });

  test("a post's first YouTube video follows the card as a message of its own, where Discord plays it", async () => {
    const {sent, announcer: discordAnnouncer} = announcer();

    await discordAnnouncer.publish(
      event({
        // Only the first video is relayed.
        media: [
          {
            kind: 'video',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            videoId: 'dQw4w9WgXcQ',
          },
          {
            kind: 'video',
            url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
            videoId: 'aaaaaaaaaaa',
          },
        ],
      }),
    );

    // Discord doesn't preview links in a message that has a card.
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({content: '📜 New post by **snek\\_lord**'});
    expect(sent[1]).toStrictEqual({
      username: 'Everise',
      avatar_url: 'https://site/assets/images/everise-crest.png',
      content: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      allowed_mentions: {parse: []},
    });
  });

  test('a post without a video has just the headline', async () => {
    const {sent, announcer: discordAnnouncer} = announcer();

    await discordAnnouncer.publish(
      event({
        body: 'A link in text: https://youtu.be/dQw4w9WgXcQ here',
        media: [],
      }),
    );

    expect((sent[0] as {content: string}).content).toBe(
      '📜 New post by **snek\\_lord**',
    );
  });

  test('announces nothing without a webhook', async () => {
    const fetchFn = jest.fn();

    await new DiscordAnnouncer(undefined, 'https://site', fetchFn).publish(
      event({}),
    );

    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('GET /api/discord/widget', () => {
  let token: string;

  beforeAll(async () => {
    ({
      user: {token},
    } = await usersClient.registerRandomUser());
  });

  afterEach(() => {
    clock.now = undefined;
    discord.widgetStatus = 200;
  });

  const getWidget = () =>
    request(app)
      .get('/api/discord/widget')
      .set('authorization', `Token ${token}`);

  test("shows a member who's online, and asks Discord at most once a minute", async () => {
    clock.now = new Date('2026-10-06T10:00:00Z');
    discord.widgetReads = 0;
    discord.widget = {
      name: 'EVERISE',
      presence_count: 6,
      members: [
        {
          username: 'Tataru',
          avatar_url: 'https://cdn.discordapp.com/widget-avatars/x',
          status: 'online',
        },
      ],
    };

    const response = await getWidget();

    expect(response.status).toBe(200);
    // Kept by the member's browser only, never by a shared cache.
    expect(response.headers['cache-control']).toBe('private, max-age=60');
    expect(response.body).toStrictEqual({
      widget: {
        name: 'EVERISE',
        presenceCount: 6,
        members: [
          {
            name: 'Tataru',
            avatarUrl: 'https://cdn.discordapp.com/widget-avatars/x',
            status: 'online',
          },
        ],
      },
    });
    await getWidget();
    expect(discord.widgetReads).toBe(1);

    clock.now = new Date('2026-10-06T10:01:01Z');
    await getWidget();
    expect(discord.widgetReads).toBe(2);
  });

  test("is null when the server's widget is turned off", async () => {
    clock.now = new Date('2026-10-06T12:00:00Z');
    discord.widgetStatus = 403;

    const response = await getWidget();

    expect(response.body).toStrictEqual({widget: null});
  });

  test("doesn't show guests who's online, nor ask Discord for them", async () => {
    clock.now = new Date('2026-10-06T14:00:00Z');
    discord.widgetReads = 0;

    const response = await request(app).get('/api/discord/widget');

    expect(response.status).toBe(401);
    expect(discord.widgetReads).toBe(0);
  });
});
