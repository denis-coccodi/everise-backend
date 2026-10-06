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

// A YouTube video: its id, and where to start (seconds).
interface YouTubeVideo {
  id: string;
  start: number;
}

// The video a link points at, or undefined for anything else. Understands
// the links YouTube shares: watch?v=, youtu.be/, /shorts/, /live/, /embed/.
// The same rules as the site's libs/media/src/lib/youtube.ts.
function youTubeVideo(link: string): YouTubeVideo | undefined {
  let url: URL;
  try {
    url = new URL(link.trim());
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
  if (!id || !ID.test(id)) return undefined;
  return {
    id,
    start: seconds(url.searchParams.get('t') ?? url.searchParams.get('start')),
  };
}

// "90", "90s" or "1m30s" as seconds; 0 when missing or unreadable.
function seconds(value: string | null): number {
  if (!value) return 0;
  if (/^\d+s?$/.test(value)) return parseInt(value, 10);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) return 0;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

// The plain watch link for a video.
function youTubeLink(video: YouTubeVideo): string {
  return `https://www.youtube.com/watch?v=${video.id}${
    video.start ? `&t=${video.start}s` : ''
  }`;
}

// The first YouTube video in a text, as the site shows them: a link alone on
// its line (optionally in <angle brackets>), as a plain watch link.
function firstYouTubeLink(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    const video = youTubeVideo(line.trim().replace(/^<(.*)>$/, '$1'));
    if (video) return `https://www.youtube.com/watch?v=${video.id}`;
  }
  return undefined;
}

export {YouTubeVideo, firstYouTubeLink, youTubeLink, youTubeVideo};
