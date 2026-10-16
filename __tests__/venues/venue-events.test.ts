import 'jest-extended';
import request from 'supertest';
import {
  app,
  clock,
  ffxivVenue,
  ffxivVenues,
  partake,
  partakeEvent,
} from '../utils';

const ID = '03SsBX8Q1dkl';

// Each test starts two hours after the last, so the venue and the events
// are read again.
let start = Date.parse('2026-10-17T18:00:00Z');

// The venue (ffxivVenue) is on Shiva, at Goblet, Ward 25, Plot 48, and
// gives https://discord.gg/CJDxHSSWWC.
const at = (location: string, overrides: Record<string, unknown> = {}) =>
  partakeEvent({
    title: location,
    location,
    locationData: {dataCenter: {name: 'Light'}, server: {name: 'Shiva'}},
    team: {name: 'Someone', discordUrl: 'https://discord.gg/other'},
    ...overrides,
  });

const page = () => request(app).get(`/api/venues/${ID}`);
const titles = (response: request.Response) =>
  response.body.events.map((e: {title: string}) => e.title);

beforeEach(() => {
  start += 2 * 3_600_000;
  clock.now = new Date(start);
  ffxivVenues.status = 200;
  ffxivVenues.venues = {Light: [ffxivVenue()]};
  partake.status = 200;
  partake.events = [];
});

afterAll(() => {
  clock.now = undefined;
});

describe("GET /api/venues/:id's events", () => {
  test('shows the events at its house on its world', async () => {
    partake.events = [
      at('Goblet - W25 - P48', {id: 1}),
      at('The Goblet, Ward 25, Plot 48', {id: 2}),
    ];

    const response = await page();

    expect(response.status).toBe(200);
    expect(titles(response)).toIncludeSameMembers([
      'Goblet - W25 - P48',
      'The Goblet, Ward 25, Plot 48',
    ]);
    // In the Events page's shape.
    expect(response.body.events[0]).toContainKeys(['id', 'startsAt', 'url']);
  });

  test('shows the events of the team whose Discord the venue gives, wherever it says they are', async () => {
    partake.events = [
      at('Our place!', {
        id: 3,
        team: {
          name: 'Knights',
          discordUrl: 'https://discord.com/invite/cjdxhssWWC',
        },
      }),
    ];

    expect(titles(await page())).toEqual(['Our place!']);
  });

  test('leaves out every event it can only guess is there', async () => {
    partake.events = [
      // Another world, or none.
      at('Goblet W25 P48', {id: 4, locationData: {server: {name: 'Omega'}}}),
      at('Goblet W25 P48', {id: 5, locationData: null}),
      // Another house on its world.
      at('Goblet W25 P47', {id: 6}),
      at('Mist W25 P48', {id: 7}),
      // No ward or plot marked.
      at('Goblet 25 48', {id: 8}),
      // Its team's Discord, on another world.
      at('Somewhere', {
        id: 9,
        locationData: {server: {name: 'Omega'}},
        team: {name: 'Knights', discordUrl: 'https://discord.gg/CJDxHSSWWC'},
      }),
      // Never ADULT, even at the venue.
      at('Goblet W25 P48', {id: 10, ageRating: 'ADULT'}),
    ];

    expect((await page()).body.events).toEqual([]);
  });

  test('matches a venue without a house only by its Discord', async () => {
    ffxivVenues.venues = {
      Light: [
        ffxivVenue({
          location: {
            dataCenter: 'Light',
            world: 'Shiva',
            district: 'Goblet',
            ward: 25,
            plot: 0,
            apartment: 48,
            subdivision: false,
            override: null,
          },
        }),
      ],
    };
    partake.events = [
      at('Goblet W25 P48', {id: 11}),
      at('Apartment 48', {
        id: 12,
        team: {name: 'Knights', discordUrl: 'https://discord.gg/CJDxHSSWWC'},
      }),
    ];

    expect(titles(await page())).toEqual(['Apartment 48']);
  });

  test("still shows the venue while Partake can't be reached", async () => {
    partake.status = 503;

    const response = await page();

    expect(response.status).toBe(200);
    expect(response.body.venue.id).toBe(ID);
    expect(response.body.events).toEqual([]);
  });
});
