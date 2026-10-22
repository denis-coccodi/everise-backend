import type {EventDetail} from '../events';
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

// An event shared by a member, with their words: the start of its
// description, when it is (in each reader's own time, Discord's
// timestamps), where, who runs it, what it is and its banner. Links to the
// event's page on the site.
function eventMessage(
  sharer: Sharer,
  event: EventDetail,
  comment: string,
  link: string,
  siteUrl: string,
) {
  const starts = seconds(event.startsAt);
  const ends = seconds(event.endsAt);
  const where = [event.world, event.location].filter(Boolean).join(', ');
  const fields = [
    {
      name: event.live ? 'Going on now' : 'When',
      value: event.live
        ? `Until <t:${ends}:t>`
        : `<t:${starts}:F> (<t:${starts}:R>), until <t:${ends}:t>`,
      inline: false,
    },
    ...(where
      ? [
          {
            name: 'Where',
            value: truncate(
              event.dataCentre ? `${where} (${event.dataCentre})` : where,
              1024,
            ),
            inline: false,
          },
        ]
      : []),
    ...(event.team
      ? [
          {
            name: 'Hosted by',
            value: truncate(event.team.name, 1024),
            inline: true,
          },
        ]
      : []),
    ...(event.ageRating === 'MATURE'
      ? [{name: 'Rated', value: 'Mature', inline: true}]
      : []),
    ...(event.tags.length
      ? [
          {
            name: 'What',
            value: truncate(event.tags.join(' · '), 1024),
            inline: false,
          },
        ]
      : []),
  ];
  const embed = {
    title: truncate(event.title, 256),
    url: link,
    ...(event.summary ? {description: truncate(event.summary, 350)} : {}),
    color: CREST_ORANGE,
    author: authorOf(sharer, siteUrl),
    fields,
    ...(event.banner ? {image: {url: event.banner}} : {}),
    footer: {
      text: `Everise Events${event.dataCentre ? ` · ${event.dataCentre}` : ''} · listed on Partake`,
      icon_url: crest(siteUrl),
    },
  };
  const headline = `🎉 **${escape(sharer.username)}** shared an event`;
  return message(siteUrl, headline + quote(comment), [embed]);
}

function seconds(iso: string) {
  return Math.floor(Date.parse(iso) / 1000);
}

export {eventMessage};
