import type {VenueDetail} from '../venues';
import {
  CREST_ORANGE,
  authorOf,
  crest,
  escape,
  message,
  quote,
  truncate,
} from './discord-format';
import {Sharer} from './discord-model';

// A venue shared by a member, with their words: what the owners say about
// it (the first paragraph), where it is, when it next opens (in each
// reader's own time, Discord's timestamps), what it offers and its banner.
// Links to the venue's page on the site.
function venueMessage(
  sharer: Sharer,
  venue: VenueDetail,
  comment: string,
  link: string,
  siteUrl: string,
) {
  const opening = venue.nextOpening;
  const where = [venue.world, venue.address].filter(Boolean).join(', ');
  const fields = [
    ...(where
      ? [
          {
            name: 'Where',
            value: truncate(
              venue.dataCentre ? `${where} (${venue.dataCentre})` : where,
              1024,
            ),
            inline: false,
          },
        ]
      : []),
    {
      name: opening?.openNow ? 'Open now' : 'Next open',
      value: opening
        ? opening.openNow
          ? `Until <t:${seconds(opening.closesAt)}:t>`
          : `<t:${seconds(opening.opensAt)}:F> (<t:${seconds(opening.opensAt)}:R>)`
        : 'No opening set yet',
      inline: false,
    },
    ...(venue.tags.length
      ? [
          {
            name: 'Offers',
            value: truncate(venue.tags.join(' · '), 1024),
            inline: false,
          },
        ]
      : []),
  ];
  const description = venue.description[0]
    ? truncate(venue.description[0], 350)
    : '';
  const embed = {
    title: truncate(venue.name, 256),
    url: link,
    ...(description ? {description} : {}),
    color: CREST_ORANGE,
    author: authorOf(sharer, siteUrl),
    fields,
    ...(venue.banner ? {image: {url: venue.banner}} : {}),
    footer: {
      text: `Everise Venues${venue.dataCentre ? ` · ${venue.dataCentre}` : ''} · listed on FFXIV Venues`,
      icon_url: crest(siteUrl),
    },
  };
  const headline = `🏮 **${escape(sharer.displayName)}** shared a venue`;
  return message(siteUrl, headline + quote(comment), [embed]);
}

function seconds(iso: string) {
  return Math.floor(Date.parse(iso) / 1000);
}

export {venueMessage};
