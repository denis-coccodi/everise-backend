import 'jest-extended';
import request from 'supertest';
import {app, clock, partake, partakeEvent} from '../utils';

// Each test starts two hours after the last, so the board reads Partake
// again and nothing it kept is still shown when Partake fails.
let start = Date.parse('2026-10-16T18:00:00Z');
function at(offsetSeconds = 0) {
  clock.now = new Date(start + offsetSeconds * 1000);
  return clock.now;
}

const event = partakeEvent;

const events = () => request(app).get('/api/events');
const titles = (response: request.Response) =>
  response.body.events.map((e: {title: string}) => e.title);

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

describe('GET /api/events', () => {
  test("shows the week's events, in the page's shape, for everyone", async () => {
    partake.events = [event()];

    const response = await events();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(response.body).toStrictEqual({
      fetchedAt: clock.now!.toISOString(),
      events: [
        {
          id: 56133,
          title: 'CLUB NOIR- RSVP',
          summary: 'Tonight Bring a date and dance the night away.',
          startsAt: new Date(start + 2 * 3_600_000).toISOString(),
          endsAt: new Date(start + 6 * 3_600_000).toISOString(),
          live: false,
          ageRating: 'MATURE',
          dataCentre: 'Chaos',
          world: 'Omega',
          location: 'Empyreum, Ward 30, Plot 52',
          tags: ['Bars & Lounges', 'Live DJs'],
          banner:
            'https://cdn.partake.gg/assets/4edcfd0b403b4e5db1044f18e5f50fac.webp',
          recurring: false,
          attendees: 11,
          team: {
            name: 'Club Noir',
            icon: 'https://cdn.partake.gg/assets/d6985c1a95c3449a98f80a8686c77167.webp?cropX=50&cropY=50&cropZoom=1.00',
            discord: 'https://discord.gg/pMZepR8XYP',
            website: null,
          },
          url: 'https://www.partake.gg/events/56133',
        },
      ],
    });
  });

  test('asks Partake for the FFXIV events rated at most MATURE, going on or starting within a week', async () => {
    at(7 * 60);

    await events();

    // The window starts on the five minutes, so every instance asks alike.
    const from = new Date(start + 5 * 60_000);
    const to = new Date(from.getTime() + 7 * 24 * 3_600_000);
    expect(partake.queries).toHaveLength(1);
    const query = partake.queries[0];
    expect(query).toInclude('game: "final-fantasy-xiv"');
    expect(query).toInclude('ageRating: MATURE');
    expect(query).toInclude(`endsBetween: {start: "${from.toISOString()}"}`);
    expect(query).toInclude(`startsBetween: {end: "${to.toISOString()}"}`);
  });

  test("never shows an ADULT event, another game's, or one without its times", async () => {
    partake.events = [
      event({id: 1, title: 'Everyone', ageRating: 'EVERYONE'}),
      event({id: 2, title: 'Teen', ageRating: 'TEEN'}),
      event({id: 3, title: 'Mature', ageRating: 'MATURE'}),
      event({id: 4, title: 'Adult', ageRating: 'ADULT'}),
      event({id: 5, title: 'No rating', ageRating: null}),
      event({id: 6, title: 'Other game', game: {id: 'world-of-warcraft'}}),
      event({id: 7, title: 'No start', startsAt: null}),
      event({id: 8, title: '  '}),
    ];

    const response = await events();

    expect(titles(response)).toIncludeSameMembers([
      'Everyone',
      'Teen',
      'Mature',
    ]);
  });

  test('shows the ones going on first, then by their start, and none that ended', async () => {
    partake.events = [
      event({id: 1, title: 'Later'}, 30),
      event({id: 2, title: 'Sooner'}, 1),
      event({id: 3, title: 'Ended'}, -5),
      event({id: 4, title: 'Going on'}, -1),
    ];

    const response = await events();

    expect(titles(response)).toEqual(['Going on', 'Sooner', 'Later']);
    expect(response.body.events[0].live).toBe(true);
  });

  test("shows what Partake doesn't say as null, and only https addresses", async () => {
    partake.events = [
      event({
        description: null,
        location: ' ',
        locationData: null,
        tags: null,
        attachments: [],
        isRecurring: true,
        attendeeCount: null,
        team: {
          name: 'Club Noir',
          iconUrl: 'javascript:alert(1)',
          discordUrl: 'http://discord.gg/x',
          websiteUrl: 'https://club-noir.example',
        },
      }),
      event({id: 2, attachments: ['../elsewhere'], team: {name: ''}}),
    ];

    const [first, second] = (await events()).body.events;

    expect(first).toMatchObject({
      summary: '',
      location: null,
      dataCentre: null,
      world: null,
      tags: [],
      banner: null,
      recurring: true,
      attendees: 0,
      team: {
        name: 'Club Noir',
        icon: null,
        discord: null,
        website: 'https://club-noir.example',
      },
    });
    expect(second).toMatchObject({banner: null, team: null});
  });

  test('gives a banner named without an extension one the CDN serves', async () => {
    partake.events = [
      event({attachments: ['e3fad8f1bb1c4254976e30a143016b61']}),
    ];

    const [shown] = (await events()).body.events;

    expect(shown.banner).toBe(
      'https://cdn.partake.gg/assets/e3fad8f1bb1c4254976e30a143016b61.webp',
    );
  });

  test('keeps a long description to a short summary', async () => {
    partake.events = [event({description: `${'word '.repeat(100)}`})];

    const {summary} = (await events()).body.events[0];

    expect(summary.length).toBeLessThanOrEqual(200);
    expect(summary).toEndWith('word…');
  });

  test('reads Partake at most every five minutes', async () => {
    partake.events = [event()];

    await events();
    at(4 * 60);
    await events();
    expect(partake.queries).toHaveLength(1);

    at(5 * 60);
    await events();
    expect(partake.queries).toHaveLength(2);
  });

  test("keeps the last events for an hour while Partake can't be reached", async () => {
    partake.status = 503;
    const never = await events();
    expect(never.status).toBe(502);
    expect(never.body.errors.body).toEqual([
      "The events can't be reached right now. Try again in a few minutes.",
    ]);

    // Asked again 30 seconds after a failed read, not five minutes.
    partake.status = 200;
    partake.events = [event()];
    at(30);
    expect((await events()).status).toBe(200);

    partake.status = 500;
    at(10 * 60);
    expect(titles(await events())).toEqual(['CLUB NOIR- RSVP']);

    at(61 * 60);
    expect((await events()).status).toBe(502);
  });

  test("answers 502 when Partake's answer has no events", async () => {
    partake.events = {} as never;

    expect((await events()).status).toBe(502);
  });
});
