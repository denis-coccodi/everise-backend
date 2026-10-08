import {ShownListing, listingName} from '../party-finder';
import {
  CREST_ORANGE,
  Sharer,
  authorOf,
  crest,
  escape,
  message,
  quote,
  truncate,
} from './discord-format';

// A shared Party Finder listing as it was: its data centre, the listing,
// and the picture of the site's card for it, when the member's browser made
// one.
interface SharedListing {
  dataCentre: string;
  listing: ShownListing;
  picture?: string;
}

// The line beside the card, by the game's Party Finder tab.
const CATEGORY_COLOURS: Record<string, number> = {
  HighEndDuty: 0xc0392b,
  Raid: 0x8e44ad,
  Trial: 0xe67e22,
  Dungeon: 0x2e86c1,
  DutyRoulette: 0x17a589,
  Guildhest: 0x5dade2,
  TheHunt: 0xd4ac0d,
  Fate: 0xd4ac0d,
  TreasureHunt: 0xb7950b,
  DeepDungeon: 0x5d6d7e,
  FieldOperation: 0x229954,
  VariantAndCriterionDungeon: 0x7d3c98,
  PvP: 0xcb4335,
};

const ROLE_EMOJI = {tank: '🛡️', healer: '💚', dps: '⚔️'} as const;
const OBJECTIVES = {
  completion: 'Duty Completion',
  practice: 'Practice',
  loot: 'Loot',
} as const;
const LOOT = {normal: '', 'greed-only': 'Greed Only', lootmaster: 'Lootmaster'};

// A Party Finder listing shared by a member, with their words: the duty,
// the party (who's in, what's still needed), the conditions, where, when it
// ends, and the picture of the site's card. Links to the post, or to the
// listing on the data centre's Party Finder page.
function listingMessage(
  sharer: Sharer,
  shared: SharedListing,
  comment: string,
  link: string,
  siteUrl: string,
) {
  const {dataCentre, listing, picture} = shared;
  const open = listing.slots.filter(slot => !slot.job);
  const filled = listing.slots.flatMap(slot => (slot.job ? [slot.job] : []));
  const conditions = [
    listing.objective ? OBJECTIVES[listing.objective] : '',
    listing.dutyComplete ? 'Duty Complete' : '',
    LOOT[listing.loot],
    listing.onePlayerPerJob ? 'One Player per Job' : '',
  ].filter(Boolean);
  const description = [
    listing.description ? truncate(listing.description, 350) : '',
    listing.beginnersWelcome ? '🌱 Beginners welcome' : '',
  ]
    .filter(Boolean)
    .join('\n');
  const fields = [
    {
      name: `Needs ${open.length} of ${listing.slots.length}`,
      value: open.length
        ? open
            .map(slot => slot.roles.map(r => ROLE_EMOJI[r]).join('/'))
            .join(' · ')
        : 'Full',
      inline: true,
    },
    {
      name: 'In the party',
      value: filled.length ? filled.join(' · ') : 'Nobody yet',
      inline: true,
    },
    ...(conditions.length
      ? [
          {
            name: 'Conditions',
            value: conditions.map(c => `[${c}]`).join(' '),
            inline: false,
          },
        ]
      : []),
    {
      name: 'Recruiter',
      value: `${listing.recruiter} · ${listing.homeWorld.name}`,
      inline: true,
    },
    {
      name: 'Location',
      value: `${listing.world.name} (${dataCentre})${listing.worldOnly ? ', only from there' : ''}`,
      inline: true,
    },
    ...(listing.minItemLevel > 0
      ? [
          {
            name: 'Item level',
            value: String(listing.minItemLevel),
            inline: true,
          },
        ]
      : []),
    {
      name: 'Ends',
      value: `<t:${Math.floor(Date.parse(listing.expiresAt) / 1000)}:R>`,
      inline: true,
    },
  ];
  const embed = {
    title: truncate(listingName(listing), 256),
    url: link,
    ...(description ? {description} : {}),
    color: CATEGORY_COLOURS[listing.category] ?? CREST_ORANGE,
    author: authorOf(sharer, siteUrl),
    fields,
    ...(listing.dutyIcon
      ? {thumbnail: {url: `${siteUrl}/api/images/${listing.dutyIcon}`}}
      : {}),
    ...(picture ? {image: {url: picture}} : {}),
    footer: {
      text: `Everise Party Finder · ${dataCentre}`,
      icon_url: crest(siteUrl),
    },
  };
  const headline = `📣 **${escape(sharer.username)}** shared a Party Finder listing`;
  return message(siteUrl, headline + quote(comment), [embed]);
}

export {SharedListing, listingMessage};
