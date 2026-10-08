import type {ArticleDto} from '../articles/article-dto';
import {
  CREST_ORANGE,
  authorOf,
  escape,
  fromDiscord,
  message,
  truncate,
} from './discord-format';
import {listingMessage} from './listing-message';

// A new post in the Everise Discord, when its author asks: its card (with
// its roulette result or shared Party Finder listing), linking back to it.

type ArticleEvent = ArticleDto['article'];

// A post: its card, then its first video as a message of its own (Discord
// previews links, and plays videos, only in messages without a card).
function articleMessages(article: ArticleEvent, siteUrl: string): object[] {
  const link = fromDiscord(
    `${siteUrl}/article/${encodeURIComponent(article.id)}`,
  );
  const shared = article.partyFinder;
  const first = shared
    ? listingMessage(article.author, shared, article.body, link, siteUrl)
    : articleCard(article, link, siteUrl);
  const video = article.media.find(item => item.kind === 'video')?.url;
  return [first, ...(video ? [message(siteUrl, video)] : [])];
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

// The picture for a post: the roulette's banner, or the post's first image
// or GIF (an upload's address is the site's own, which Discord can fetch).
function imageOf(article: ArticleEvent, siteUrl: string) {
  if (article.roulette?.image) {
    return {image: {url: `${siteUrl}/api/images/${article.roulette.image}`}};
  }
  const first = article.media.find(item => item.kind !== 'video');
  return first ? {image: {url: first.url}} : {};
}

export {articleMessages};
