import {URLSearchParams} from 'url';
import {UpstreamError} from '../errors';

// How the app calls GIPHY (the parts of fetch it uses); tests pass a fake.
type GifFetch = (
  url: string
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

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

interface GiphyImage {
  url?: string;
  width?: string;
  height?: string;
}

interface GiphyGif {
  id: string;
  title?: string;
  images?: Record<string, GiphyImage | undefined>;
}

const PAGE_SIZE = 24;

// Searches GIPHY through the backend, so the API key stays a secret. Without
// a key the search isn't offered.
class GifSearch {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchFn: GifFetch = url =>
      (fetch as unknown as GifFetch)(url)
  ) {}

  get available() {
    return !!this.apiKey;
  }

  // A page of GIFs for the words, or GIPHY's trending ones without any.
  async search(query: string, offset: number) {
    const params = new URLSearchParams({
      api_key: this.apiKey ?? '',
      limit: String(PAGE_SIZE),
      offset: String(offset),
      // Fine for everyone on the site.
      rating: 'pg-13',
      bundle: 'messaging_non_clips',
    });
    const words = query.trim();
    if (words) params.set('q', words);
    const endpoint = words ? 'search' : 'trending';

    const response = await this.fetchFn(
      `https://api.giphy.com/v1/gifs/${endpoint}?${params}`
    );
    if (!response.ok) {
      throw new UpstreamError(
        `GIF search isn't available right now (GIPHY answered ${response.status}).`
      );
    }
    const body = (await response.json()) as {
      data?: GiphyGif[];
      pagination?: {total_count?: number; count?: number; offset?: number};
    };
    const gifs = (body.data ?? []).flatMap(toGif);
    const shown =
      (body.pagination?.offset ?? offset) + (body.data?.length ?? 0);
    const total = body.pagination?.total_count ?? shown;
    return {gifs, next: shown < total ? shown : null};
  }
}

function toGif(gif: GiphyGif): Gif[] {
  const preview = gif.images?.fixed_height_small ?? gif.images?.fixed_height;
  // Small enough to load quickly in a post, sharp enough to read.
  const full = gif.images?.downsized_medium ?? gif.images?.original;
  if (!preview?.url || !full?.url) return [];
  return [
    {
      id: gif.id,
      title: gif.title?.trim() || 'GIF',
      previewUrl: preview.url,
      url: full.url,
      width: Number(full.width) || 0,
      height: Number(full.height) || 0,
    },
  ];
}

export {Gif, GifFetch, GifSearch};
