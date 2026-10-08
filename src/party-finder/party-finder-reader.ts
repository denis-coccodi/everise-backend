import {DataCentre, REGION_LIST} from './data-centres';
import {PartyFinderSource} from './party-finder-board';
import {PARTY_FINDER_ICONS, categoryIcon} from './xivpf-duties';
import {PartyFinderListing} from './xivpf-listing';

// A duty's level, sort key and type icon, by its name in lower case.
type DutiesByName = () => Promise<
  ReadonlyMap<string, {level: number; sortKey: number; icon: number | null}>
>;

// A listing as the site shows it: with its duty's level, sort key and type icon.
type ShownListing = ReturnType<typeof withDuty>;

// The duty data changes only with a refresh: it's read again after this.
const DUTIES_CACHE_MS = 10 * 60 * 1000;

// A data centre's listings as the Party Finder page shows them, from xivpf
// (through the source), each with its duty's level and sort key (the game
// lists the highest level first, then by the game's own order) and its duty
// type's icon from the duty data. Null while xivpf can't be reached.
class PartyFinderReader {
  private duties?: {
    at: number;
    byName: Awaited<ReturnType<DutiesByName>>;
  };

  constructor(
    private readonly source: PartyFinderSource,
    private readonly dutiesByName: DutiesByName,
    private readonly now: () => Date,
  ) {}

  async board(dataCentre: DataCentre) {
    const board = await this.source.board(dataCentre);
    if (!board) return null;
    const duties = await this.readDuties();
    return {
      ...board,
      regions: REGION_LIST,
      icons: PARTY_FINDER_ICONS,
      listings: board.listings.map(listing => withDuty(listing, duties)),
    };
  }

  // One listing, while it's still up; undefined once it's gone.
  async listing(dataCentre: DataCentre, id: string) {
    return (await this.board(dataCentre))?.listings.find(
      listing => listing.id === id,
    );
  }

  private async readDuties() {
    const now = this.now().getTime();
    if (!this.duties || now - this.duties.at >= DUTIES_CACHE_MS) {
      this.duties = {at: now, byName: await this.dutiesByName()};
    }
    return this.duties.byName;
  }
}

function withDuty(
  listing: PartyFinderListing,
  duties: Awaited<ReturnType<DutiesByName>>,
) {
  const duty = listing.duty
    ? duties.get(listing.duty.toLowerCase())
    : undefined;
  return {
    ...listing,
    dutyIcon: duty?.icon ?? categoryIcon(listing.category),
    level: duty?.level ?? null,
    sortKey: duty?.sortKey ?? null,
  };
}

export {DutiesByName, PartyFinderReader, ShownListing};
