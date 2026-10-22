import {ImageType} from '../users';

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

// A GIF as the site's picker shows it: a small preview, and the larger one
// put in the post or comment.
interface Gif {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
  width: number;
  height: number;
}

interface StoredMedia {
  id: string;
  url: string;
  contentType: ImageType;
  width: number;
  height: number;
}

// A YouTube video: its id, and where to start (seconds).
interface YouTubeVideo {
  id: string;
  start: number;
}

export {Attachment, Gif, StoredMedia, YouTubeVideo};
