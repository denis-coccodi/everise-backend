import {clock} from './app';

// An event as Partake sends it, starting `startsIn` hours from the app's
// clock for four hours.
function partakeEvent(
  overrides: Record<string, unknown> = {},
  startsIn = 2,
): Record<string, unknown> {
  const starts = clock.now!.getTime() + startsIn * 3_600_000;
  return {
    id: 56133,
    title: 'CLUB NOIR- RSVP ',
    description:
      '\n![](https://cdn.partake.gg/assets/9cd45f8b43c84fbdb2b49a2185dd0bf2.webp)\n\n## Tonight\n\nBring a **date** and [dance](https://example.com) the night away.\n',
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(starts + 4 * 3_600_000).toISOString(),
    location: 'Empyreum, Ward 30, Plot 52',
    locationData: {
      dataCenter: {name: 'Chaos'},
      server: {name: 'Omega'},
    },
    ageRating: 'MATURE',
    tags: ['Bars & Lounges', 'Live DJs', null],
    attachments: ['4edcfd0b403b4e5db1044f18e5f50fac.webp'],
    isRecurring: false,
    attendeeCount: 11,
    game: {id: 'final-fantasy-xiv'},
    team: {
      name: 'Club Noir',
      iconUrl:
        'https://cdn.partake.gg/assets/d6985c1a95c3449a98f80a8686c77167.webp?cropX=50&cropY=50&cropZoom=1.00',
      discordUrl: 'https://discord.gg/pMZepR8XYP',
      websiteUrl: null,
    },
    ...overrides,
  };
}

export {partakeEvent};
