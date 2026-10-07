import {currentSiteUrl, sitePathRest} from '../site-urls';
import {youTubeLink, youTubeVideo} from './youtube';

// An image, GIF or YouTube video attached to a post or comment, shown apart
// from its text: in a grid in the feeds, below the text on the post's page.
type Attachment =
  | {
      kind: 'image' | 'gif';
      // An upload (this site's /api/media/:id), a GIPHY GIF, or any https
      // image.
      url: string;
      // What it shows, for people who can't see it.
      alt?: string;
      // Its size, when known, so the page keeps its space while it loads.
      width?: number;
      height?: number;
    }
  | {
      kind: 'video';
      // A plain YouTube watch link.
      url: string;
      videoId: string;
      start?: number;
      alt?: string;
    };

const MAX_POST_ATTACHMENTS = 4;
const MAX_COMMENT_ATTACHMENTS = 1;

// Checks what the site sent and keeps only what's needed: a video must be a
// YouTube video; images must be https (or this site, in local development).
function cleanAttachment(input: {
  kind: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}): Attachment {
  const alt = input.alt?.trim() || undefined;
  if (input.kind === 'video') {
    const video = youTubeVideo(input.url);
    if (!video) {
      throw new RangeError('That video link isn’t a YouTube video.');
    }
    return {
      kind: 'video',
      url: youTubeLink(video),
      videoId: video.id,
      ...(video.start ? {start: video.start} : {}),
      ...(alt ? {alt} : {}),
    };
  }
  if (!input.url.startsWith('https://') && !isUpload(input.url)) {
    throw new RangeError('Images must have an https address.');
  }
  return {
    kind: input.kind === 'gif' ? 'gif' : 'image',
    url: input.url,
    ...(alt ? {alt} : {}),
    ...(input.width && input.height
      ? {width: input.width, height: input.height}
      : {}),
  };
}

// The upload's id when an attachment is one of this site's uploads.
function uploadIdOf(attachment: Attachment): string | undefined {
  if (attachment.kind === 'video' || !isUpload(attachment.url)) {
    return undefined;
  }
  return sitePathRest(attachment.url, '/api/media/')?.split(/[?#]/)[0];
}

// One of this site's uploads, at its current address or an earlier one.
function isUpload(url: string) {
  return sitePathRest(url, '/api/media/') !== undefined;
}

// The attachment at the site's current address, if saved under an earlier one.
function currentAttachment<T extends Attachment>(attachment: T): T {
  const url = currentSiteUrl(attachment.url);
  return url === attachment.url ? attachment : {...attachment, url};
}

// Posts written before attachments had their media in the text: Markdown
// images (![alt](address)) and YouTube links alone on a line. Read as
// attachments, with the text left without them, so old posts show the same
// way as new ones. Nothing is written back.
function attachmentsFromText(text: string): {
  attachments: Attachment[];
  text: string;
} {
  const attachments: Attachment[] = [];
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const image = /^!\[([^\]]*)\]\((\S+?)\)$/.exec(trimmed);
    const video = youTubeVideo(trimmed.replace(/^<(.*)>$/, '$1'));
    if (image && image[2].startsWith('http')) {
      attachments.push({
        kind: /\.gif(\?|$)|giphy\.com/i.test(image[2]) ? 'gif' : 'image',
        url: image[2],
        ...(image[1].trim() ? {alt: image[1].trim()} : {}),
      });
    } else if (video) {
      attachments.push({
        kind: 'video',
        url: youTubeLink(video),
        videoId: video.id,
        ...(video.start ? {start: video.start} : {}),
      });
    } else {
      kept.push(line);
    }
  }
  return {
    attachments,
    text: kept
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  };
}

export {
  Attachment,
  MAX_COMMENT_ATTACHMENTS,
  MAX_POST_ATTACHMENTS,
  attachmentsFromText,
  cleanAttachment,
  currentAttachment,
  uploadIdOf,
};
