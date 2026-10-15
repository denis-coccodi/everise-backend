import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {REGION_LIST} from '../party-finder';
import {VENUE_DATA_CENTRES} from './venues-board';

const VenueDataCentreName = z.enum(VENUE_DATA_CENTRES);

const Venue = z.strictObject({
  id: z.string(),
  name: z.string(),
  // Its paragraphs, as the owners wrote them.
  description: z.array(z.string()),
  // The banner picture's address on FFXIV Venues.
  banner: z.string().nullable(),
  world: z.string().nullable(),
  // Where it is ("Goblet, Ward 25 (subdivision), Plot 48"), or the owners'
  // own words for it.
  address: z.string().nullable(),
  // What it offers, as FFXIV Venues tags it ("Tavern", "Bards", ...).
  tags: z.array(z.string()),
  website: z.string().nullable(),
  // An invite to its Discord server.
  discord: z.string().nullable(),
  // Its page on FFXIV Venues.
  url: z.string(),
  // What the owners say right now ("Closed this week").
  notices: z.array(z.string()),
  // Its next opening, or the one going on (openNow).
  opensAt: isoDate,
  closesAt: isoDate,
  openNow: z.boolean(),
});

const VenuesResponse = responseSchema(
  'VenuesResponse',
  z.strictObject({
    dataCentre: VenueDataCentreName,
    // The data centres with venues, by region (Europe first), for the
    // page's list.
    regions: z.array(
      z.strictObject({
        name: z.string(),
        dataCentres: z.array(VenueDataCentreName),
      }),
    ),
    // When the site last read FFXIV Venues.
    fetchedAt: isoDate,
    // The ones open now first, then by their next opening.
    venues: z.array(Venue),
  }),
);

const VenuesQuery = z.object({
  dataCentre: z
    .enum(VENUE_DATA_CENTRES, {
      error: `Pick a data centre with venues: ${VENUE_DATA_CENTRES.join(', ')}.`,
    })
    .default('Light'),
});

// The regions and their data centres that have venues, in order.
const VENUE_REGIONS = REGION_LIST.map(region => ({
  name: region.name,
  dataCentres: VENUE_DATA_CENTRES.filter(name =>
    (region.dataCentres as string[]).includes(name),
  ),
})).filter(region => region.dataCentres.length > 0);

export {VENUE_REGIONS, VenuesQuery, VenuesResponse};
