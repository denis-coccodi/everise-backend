import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {DATA_CENTRE_NAMES} from '../party-finder';

// What the site's sitemap.xml lists besides its fixed pages.
const SitemapResponse = responseSchema(
  'SitemapResponse',
  z.strictObject({
    // The newest posts first, each with when it last changed.
    articles: z.array(z.strictObject({id: z.string(), updatedAt: isoDate})),
    // A Party Finder page each (/party-finder/<name in lower case>).
    dataCentres: z.array(z.enum(DATA_CENTRE_NAMES)),
  }),
);

export {SitemapResponse};
