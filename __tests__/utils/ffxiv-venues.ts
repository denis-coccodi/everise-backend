import {clock} from './app';

// A venue as FFXIV Venues sends it, opening `opensIn` hours from the app's
// clock for four hours.
function ffxivVenue(
  overrides: Record<string, unknown> = {},
  opensIn = 2,
): Record<string, unknown> {
  const opens = clock.now!.getTime() + opensIn * 3_600_000;
  return {
    id: '03SsBX8Q1dkl',
    name: 'The Heretic Knight',
    bannerUri: 'https://images.ffxivvenues.com/03SsBX8Q1dkl/KqB9nR35lgH2',
    added: '2025-10-09T15:50:46.786962+00:00',
    description: ['An Ishgardian tavern.', null, 'Memories last.'],
    location: {
      dataCenter: 'Light',
      world: 'Shiva',
      district: 'Goblet',
      ward: 25,
      plot: 48,
      apartment: 0,
      room: 0,
      subdivision: true,
      shard: null,
      override: null,
    },
    website: 'https://hereticknight.carrd.co/',
    discord: 'https://discord.gg/CJDxHSSWWC',
    hiring: false,
    sfw: true,
    schedule: [],
    scheduleOverrides: [],
    notices: [],
    managers: ['552205502138941507'],
    tags: ['Tavern', 'Drink', null],
    approved: true,
    mareCode: null,
    marePassword: null,
    resolution: {
      // With the venue's own offset, as FFXIV Venues sends it.
      start: new Date(opens).toISOString().replace('Z', '+00:00'),
      end: new Date(opens + 4 * 3_600_000).toISOString(),
      isNow: false,
      isWithinWeek: true,
    },
    ...overrides,
  };
}

export {ffxivVenue};
