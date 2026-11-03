import {createHash, timingSafeEqual} from 'crypto';

// The header the game data refresh sends its key in (the duties' key).
const REFRESH_KEY_HEADER = 'x-refresh-key';

// Whether `key` is the refresh key; without a configured one, refreshing
// is disabled.
function isRefreshKey(key: string | undefined, refreshKey: string | undefined) {
  if (!refreshKey || !key) return false;
  // Hashing gives equal lengths, which timingSafeEqual requires.
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(key), hash(refreshKey));
}

export {REFRESH_KEY_HEADER, isRefreshKey};
