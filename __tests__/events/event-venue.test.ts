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

const HOUR = 3_600_000;

// Each test starts two hours after the last, so the event and the venues
// are read again.
let start = Date.parse('2026-10-18T18:00:00Z');

// The venue (ffxivVenue) is on Shiva (Light), at Goblet, Ward 25, Plot 48,
// and gives https://discord.gg/CJDxHSSWWC.
const atTheKnight = (overrides: Record<string, unknown> = {}) =>
  partakeEvent({
    location: 'Goblet - W25 - P48',
    locationData: {dataCenter: {name: 'Light'}, server: {name: 'Shiva'}},
    ...overrides,
  });

const page = () => request(app).get('/api/events/56133');

beforeEach(() => {
  start += 2 * HOUR;
  clock.now = new Date(start);
  ffxivVenues.status = 200;
  ffxivVenues.venues = {Light: [ffxivVenue()]};
  ffxivVenues.requests = [];
  partake.status = 200;
  partake.events = [];
});

afterAll(() => {
  clock.now = undefined;
});

describe("GET /api/events/:id's venue", () => {
  test('names the venue the event is surely held at, to link to its page', async () => {
    partake.events = [atTheKnight()];

    const response = await page();

    expect(response.status).toBe(200);
    expect(response.body.venue).toEqual({
      id: '03SsBX8Q1dkl',
      name: 'The Heretic Knight',
    });
    // Only the event's data centre is read.
    expect(ffxivVenues.requests).toEqual([
      'https://api.ffxivvenues.com/v1/venue?dataCenter=Light&withinWeek=true',
    ]);
  });

  test("finds it by the venue's Discord too", async () => {
    partake.events = [
      atTheKnight({
        location: 'Our usual place',
        team: {name: 'Knights', discordUrl: 'https://discord.gg/cjdxhssWWC'},
      }),
    ];

    expect((await page()).body.venue?.id).toBe('03SsBX8Q1dkl');
  });

  test('names none when no venue, or more than one, matches', async () => {
    partake.events = [atTheKnight({location: 'Goblet - W25 - P47'})];
    expect((await page()).body.venue).toBeNull();

    clock.now = new Date(start + HOUR);
    ffxivVenues.venues = {
      Light: [ffxivVenue(), ffxivVenue({id: 'twin', name: 'Its twin'})],
    };
    partake.events = [atTheKnight({id: 56134})];
    const twins = await request(app).get('/api/events/56134');
    expect(twins.body.venue).toBeNull();
  });

  test("doesn't look on data centres FFXIV Venues has none on", async () => {
    partake.events = [
      atTheKnight({
        locationData: {
          dataCenter: {name: 'Elemental'},
          server: {name: 'Tonberry'},
        },
      }),
    ];

    const response = await page();

    expect(response.body.venue).toBeNull();
    expect(ffxivVenues.requests).toEqual([]);
  });

  test("still shows the event while FFXIV Venues can't be reached", async () => {
    ffxivVenues.status = 503;
    partake.events = [atTheKnight()];

    const response = await page();

    expect(response.status).toBe(200);
    expect(response.body.event.id).toBe(56133);
    expect(response.body.venue).toBeNull();
  });
});
