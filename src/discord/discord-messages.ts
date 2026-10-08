import type {ArticleDto} from '../articles/article-dto';
import {ShownListing, listingName} from '../party-finder';

// The messages the site sends to the Everise Discord, through its webhook:
// a post (with its roulette result or Party Finder listing), or a listing
// shared on its own.

type ArticleEvent = ArticleDto['article'];

// Who shared something, as the message names them.
interface Sharer {
  username: string;
  image: string;
}

// The crest's orange, the colour of the line beside each message.
const CREST_ORANGE = 0xf78627;

// A post: its card, then its first video as a message of its own (Discord
// previews links, and plays videos, only in messages without a card).
function articleMessages(article: ArticleEvent, siteUrl: string): object[] {
  const link = `${siteUrl}/article/${encodeURIComponent(article.id)}`;
  const shared = article.partyFinder;
  const first = shared
    ? listingMessage(article.author, shared, article.body, link, siteUrl)
    : articleCard(article, link, siteUrl);
  const video = article.media.find(item => item.kind === 'video')?.url;
  return [first, ...(video ? [plain(video, siteUrl)] : [])];
}

// A Party Finder listing, shared by a member with their words, linking to
// the post or the data centre's Party Finder page.
function listingMessage(
  sharer: Sharer,
  shared: {dataCentre: string; listing: ShownListing},
  comment: string,
  link: string,
  siteUrl: string,
) {
  const {dataCentre, listing} = shared;
  const remaining = listing.slots.filter(slot => !slot.job).length;
  const fields = [
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
    {name: 'Players needed', value: String(remaining), inline: true},
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
    ...(listing.description
      ? {description: truncate(listing.description, 350)}
      : {}),
    color: CREST_ORANGE,
    author: authorOf(sharer, siteUrl),
    fields,
    ...(listing.dutyIcon
      ? {thumbnail: {url: `${siteUrl}/api/images/${listing.dutyIcon}`}}
      : {}),
  };
  const headline = `📣 **${escape(sharer.username)}** shared a Party Finder listing`;
  return message(siteUrl, headline + quote(comment), [embed]);
}

// A post as a card: title, description, author, link, picture, and the
// roulette's result.
function articleCard(article: ArticleEvent, link: string, siteUrl: string) {
  const roulette = article.roulette;
  const embed = {
    title: truncate(article.title, 256),
    url: link,
    description: truncate(article.description, 350),
    color: CREST_ORANGE,
    timestamp: article.createdAt,
    author: authorOf(article.author, siteUrl),
    ...(roulette
      ? {
          fields: [
            {name: roulette.type, value: roulette.name, inline: true},
            ...(roulette.detail
              ? [{name: 'Details', value: roulette.detail, inline: true}]
              : []),
            ...(roulette.mode
              ? [{name: 'Party', value: roulette.mode, inline: false}]
              : []),
          ],
        }
      : {}),
    ...imageOf(article, siteUrl),
  };
  const author = escape(article.author.username);
  const headline = roulette
    ? `🎲 **${author}** spun the duty roulette!`
    : `📜 New post by **${author}**`;
  return message(siteUrl, headline, [embed]);
}

function message(siteUrl: string, content: string, embeds: object[] = []) {
  return {
    username: 'Everise',
    avatar_url: `${siteUrl}/assets/images/everise-crest.png`,
    content,
    ...(embeds.length ? {embeds} : {}),
    // Never ping anyone, whatever a post says.
    allowed_mentions: {parse: []},
  };
}

// A message with just a link, which Discord previews (a video it plays).
function plain(link: string, siteUrl: string) {
  return message(siteUrl, link);
}

function authorOf(sharer: Sharer, siteUrl: string) {
  return {
    name: sharer.username,
    url: `${siteUrl}/profile/${encodeURIComponent(sharer.username)}`,
    icon_url: sharer.image,
  };
}

// The picture for a post: the roulette's banner, or the post's first image
// or GIF (an upload's address is the site's own, which Discord can fetch).
function imageOf(article: ArticleEvent, siteUrl: string) {
  if (article.roulette?.image) {
    return {image: {url: `${siteUrl}/api/images/${article.roulette.image}`}};
  }
  const first = article.media.find(item => item.kind !== 'video');
  return first ? {image: {url: first.url}} : {};
}

// The member's words under the headline, as a quote.
function quote(comment: string) {
  const text = truncate(comment.trim(), 1500);
  return text ? '\n' + text.replace(/^/gm, '> ') : '';
}

function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

// Usernames with * or _ would otherwise turn into bold or italics.
function escape(text: string) {
  return text.replace(/([*_~`|\\>])/g, '\\$1');
}

export {Sharer, articleMessages, listingMessage};
