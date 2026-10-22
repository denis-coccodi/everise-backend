// FFXIV Venues' venue, as far as the page uses it. Fields may be missing or
// null, so every one is checked.
interface FfxivVenue {
  id?: string;
  name?: string;
  description?: (string | null)[] | null;
  bannerUri?: string | null;
  location?: {
    dataCenter?: string | null;
    world?: string | null;
    district?: string | null;
    ward?: number;
    plot?: number;
    apartment?: number;
    room?: number;
    subdivision?: boolean;
    override?: string | null;
  } | null;
  website?: string | null;
  discord?: string | null;
  sfw?: boolean;
  approved?: boolean;
  tags?: (string | null)[] | null;
  notices?: {start?: string; end?: string; message?: string}[] | null;
  resolution?: {start?: string; end?: string} | null;
  // Its weekly or monthly openings, each with its next one.
  schedule?:
    | {
        interval?: {intervalType?: number; intervalArgument?: number} | null;
        resolution?: {start?: string; end?: string} | null;
      }[]
    | null;
}

export {FfxivVenue};
