// What every message the site sends to the Everise Discord shares: who
// sends it, the author line, quoting and trimming text.

// Who shared something, as the message names them.
interface Sharer {
  username: string;
  image: string;
}

// The crest's orange, the colour of the line beside a post's message.
const CREST_ORANGE = 0xf78627;

function message(siteUrl: string, content: string, embeds: object[] = []) {
  return {
    username: 'Everise',
    avatar_url: crest(siteUrl),
    content,
    ...(embeds.length ? {embeds} : {}),
    // Never ping anyone, whatever a post says.
    allowed_mentions: {parse: []},
  };
}

function crest(siteUrl: string) {
  return `${siteUrl}/assets/images/everise-crest.png`;
}

function authorOf(sharer: Sharer, siteUrl: string) {
  return {
    name: sharer.username,
    url: `${siteUrl}/profile/${encodeURIComponent(sharer.username)}`,
    icon_url: sharer.image,
  };
}

// A link to the site from Discord: whoever opens it is asked to sign in
// first (the site's discordLinkGuard), since anyone in the channel sees it.
function fromDiscord(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}from=discord`;
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

export {
  CREST_ORANGE,
  Sharer,
  authorOf,
  crest,
  escape,
  fromDiscord,
  message,
  quote,
  truncate,
};
