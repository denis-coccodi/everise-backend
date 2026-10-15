import 'jest-extended';
import request from 'supertest';
import {app, clock, ffxivVenue, ffxivVenues} from '../utils';

// Each test starts two hours after the last, so the board reads FFXIV Venues
// again and nothing it kept is still shown when FFXIV Venues fails.
let start = Date.parse('2026-10-15T18:00:00Z');
function at(offsetSeconds = 0) {
  clock.now = new Date(start + offsetSeconds * 1000);
  return clock.now;
}

const venue = ffxivVenue;

const venues = (query = '') => request(app).get(`/api/venues${query}`);

beforeEach(() => {
  start += 2 * 3_600_000;
  at();
  ffxivVenues.status = 200;
  ffxivVenues.venues = {};
  ffxivVenues.requests = [];
});

afterAll(() => {
  clock.now = undefined;
});

describe('GET /api/venues', () => {
  test("shows Light's venues by default, in the page's shape, for everyone", async () => {
    ffxivVenues.venues.Light = [venue()];

    const response = await venues();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(ffxivVenues.requests).toStrictEqual([
      'https://api.ffxivvenues.com/v1/venue?dataCenter=Light&withinWeek=true',
    ]);
    expect(response.body).toStrictEqual({
      dataCentre: 'Light',
      // The data centres FFXIV Venues has venues on: none in Japan.
      regions: [
        {name: 'Europe', dataCentres: ['Light', 'Chaos']},
        {
          name: 'North America',
          dataCentres: ['Aether', 'Crystal', 'Dynamis', 'Primal'],
        },
        {name: 'Oceania', dataCentres: ['Materia']},
      ],
      fetchedAt: clock.now!.toISOString(),
      venues: [
        {
          id: '03SsBX8Q1dkl',
          name: 'The Heretic Knight',
          description: ['An Ishgardian tavern.', 'Memories last.'],
          banner: 'https://images.ffxivvenues.com/03SsBX8Q1dkl/KqB9nR35lgH2',
          world: 'Shiva',
          address: 'Goblet, Ward 25 (subdivision), Plot 48',
          tags: ['Tavern', 'Drink'],
          website: 'https://hereticknight.carrd.co/',
          discord: 'https://discord.gg/CJDxHSSWWC',
          url: 'https://ffxivvenues.com/venue/03SsBX8Q1dkl',
          notices: [],
          opensAt: new Date(start + 2 * 3_600_000).toISOString(),
          closesAt: new Date(start + 6 * 3_600_000).toISOString(),
          openNow: false,
        },
      ],
    });
  });

  test('shows the data centre asked for', async () => {
    ffxivVenues.venues.Chaos = [venue({name: 'Moogle Café'})];

    const response = await venues('?dataCentre=Chaos');

    expect(response.status).toBe(200);
    expect(response.body.dataCentre).toBe('Chaos');
    expect(response.body.venues.map((v: {name: string}) => v.name)).toEqual([
      'Moogle Café',
    ]);
    expect(ffxivVenues.requests[0]).toContain('dataCenter=Chaos');
  });

  test("says which data centres have venues, for one that doesn't", async () => {
    const response = await venues('?dataCentre=Gaia');

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'Pick a data centre with venues: Light, Chaos, Aether, Crystal, Dynamis, Primal, Materia.',
    ]);
    expect(ffxivVenues.requests).toBeEmpty();
  });

  test('puts the venues open now first, then the next to open', async () => {
    ffxivVenues.venues.Light = [
      venue({id: 'later', name: 'Later'}, 30),
      venue({id: 'soon', name: 'Soon'}, 1),
      venue({id: 'open', name: 'Open'}, -1),
    ];

    const response = await venues();

    expect(
      response.body.venues.map((v: {id: string; openNow: boolean}) => [
        v.id,
        v.openNow,
      ]),
    ).toEqual([
      ['open', true],
      ['soon', false],
      ['later', false],
    ]);
  });

  test("leaves out venues that aren't safe for work, aren't approved, have closed or can't be read", async () => {
    ffxivVenues.venues.Light = [
      venue({id: 'shown'}),
      venue({id: 'nsfw', sfw: false}),
      venue({id: 'unapproved', approved: false}),
      // Its opening ended since FFXIV Venues was read.
      venue({id: 'closed'}, -5),
      venue({id: 'unscheduled', resolution: null}),
      venue({id: undefined}),
      'not a venue',
      null,
    ];

    const response = await venues();

    expect(response.body.venues.map((v: {id: string}) => v.id)).toEqual([
      'shown',
    ]);
  });

  test('writes where the venue is: a plot, a room, an apartment, or its own words', async () => {
    const located = (id: string, location: Record<string, unknown> | null) =>
      venue({id, name: id, location});
    const house = {
      world: 'Odin',
      district: 'Mist',
      ward: 14,
      plot: 0,
      apartment: 0,
      room: 0,
      subdivision: false,
      override: null,
    };
    ffxivVenues.venues.Light = [
      located('apartment', {...house, apartment: 74}),
      located('room', {...house, plot: 60, room: 10, subdivision: true}),
      located('tour', {...house, world: '', override: ' Phoenix, a tour. '}),
      located('nowhere', null),
    ];

    const response = await venues();

    expect(
      response.body.venues.map(
        (v: {id: string; world: string; address: string}) => [
          v.id,
          v.world,
          v.address,
        ],
      ),
    ).toEqual([
      ['apartment', 'Odin', 'Mist, Ward 14, Apartment 74'],
      ['nowhere', null, null],
      ['room', 'Odin', 'Mist, Ward 14 (subdivision), Plot 60, Room 10'],
      ['tour', null, 'Phoenix, a tour.'],
    ]);
  });

  test("shows only the owners' notices that are up now", async () => {
    const hour = (h: number) => new Date(start + h * 3_600_000).toISOString();
    ffxivVenues.venues.Light = [
      venue({
        notices: [
          {start: hour(-1), end: hour(24), message: 'Closed this week.'},
          {start: hour(-48), end: hour(-24), message: 'Old news.'},
          {start: hour(1), end: hour(24), message: 'Not yet.'},
        ],
      }),
    ];

    const response = await venues();

    expect(response.body.venues[0].notices).toEqual(['Closed this week.']);
  });

  test('reads FFXIV Venues at most every five minutes per data centre', async () => {
    ffxivVenues.venues.Light = [venue()];
    await venues();
    await venues('?dataCentre=Chaos');

    at(4 * 60);
    ffxivVenues.venues.Light = [];
    const kept = await venues();
    expect(kept.body.venues).toHaveLength(1);
    expect(ffxivVenues.requests).toHaveLength(2);

    at(5 * 60);
    const read = await venues();
    expect(read.body.venues).toBeEmpty();
    expect(read.body.fetchedAt).toBe(clock.now!.toISOString());
    expect(ffxivVenues.requests).toHaveLength(3);
  });

  test('when FFXIV Venues is down, the last venues stay an hour, then 502', async () => {
    ffxivVenues.status = 503;
    const never = await venues();
    expect(never.status).toBe(502);
    expect(never.body.errors.body).toEqual([
      "The venues can't be reached right now. Try again in a few minutes.",
    ]);

    at(10 * 60);
    ffxivVenues.status = 200;
    ffxivVenues.venues.Light = [venue()];
    const read = await venues();
    expect(read.status).toBe(200);

    ffxivVenues.status = 500;
    at(30 * 60);
    const stale = await venues();
    expect(stale.status).toBe(200);
    expect(stale.body.fetchedAt).toBe(read.body.fetchedAt);

    at(80 * 60);
    expect((await venues()).status).toBe(502);
  });

  test('502 when FFXIV Venues sends something other than a list', async () => {
    ffxivVenues.venues.Light = {error: 'nope'} as unknown as unknown[];

    expect((await venues()).status).toBe(502);
  });
});
