import {config} from './config';

// The site's own addresses, saved in the data as full URLs (profile pictures,
// uploads in posts and comments), start with BASE_URL. When the site moves to
// a new address, the old ones stay in the data: LEGACY_BASE_URLS lists them,
// so they are still recognised as the site's own and are read as the current
// address. Saving a document again stores the current address.

// The part of one of the site's addresses after `path` (e.g.
// '/api/media/'), whichever of the site's addresses it starts with.
function sitePathRest(url: string, path: string): string | undefined {
  for (const base of [config.baseUrl, ...config.legacyBaseUrls]) {
    if (url.startsWith(base + path)) {
      return url.slice((base + path).length);
    }
  }
  return undefined;
}

// The address at the site's current BASE_URL, for one saved under an old one.
// Any other address is returned as it is.
function currentSiteUrl(url: string): string;
function currentSiteUrl(url: string | undefined): string | undefined;
function currentSiteUrl(url: string | undefined) {
  if (!url) return url;
  for (const base of config.legacyBaseUrls) {
    if (url.startsWith(base + '/')) {
      return config.baseUrl + url.slice(base.length);
    }
  }
  return url;
}

export {currentSiteUrl, sitePathRest};
