import {URL} from 'url';

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
];

// The first YouTube video in a post, as the site shows them: a link alone on
// its line (optionally in <angle brackets>). Returned as a plain watch link,
// which Discord turns into a playable video. The same rules as the site's
// libs/media/src/lib/youtube.ts.
function firstYouTubeLink(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    const id = youTubeId(line.trim().replace(/^<(.*)>$/, '$1'));
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }
  return undefined;
}

function youTubeId(link: string): string | undefined {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return undefined;
  }
  if (!['https:', 'http:'].includes(url.protocol)) return undefined;
  if (!HOSTS.includes(url.hostname)) return undefined;
  const path = url.pathname.split('/').filter(Boolean);
  const id =
    url.hostname === 'youtu.be'
      ? path[0]
      : path[0] === 'watch'
      ? url.searchParams.get('v')
      : ['shorts', 'live', 'embed'].includes(path[0])
      ? path[1]
      : undefined;
  return id && ID.test(id) ? id : undefined;
}

export {firstYouTubeLink};
