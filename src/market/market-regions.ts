import {DATA_CENTRES, REGION_LIST} from '../party-finder';

// A region of the game: its worlds can all be reached from each other (and
// any world can visit Oceania). Ids are the names in lower case with dashes
// ("north-america"), as links carry them; Universalis' name joins the words
// with a dash too ("North-America").
interface MarketRegion {
  id: string;
  name: string;
  universalis: string;
  dataCentres: {name: string; worlds: {id: number; name: string}[]}[];
}

// Everise's region and home world: where the page starts.
const DEFAULT_REGION = 'europe';
const HOME_WORLD = 'Odin';

const REGIONS = new Map<string, MarketRegion>(
  REGION_LIST.map(region => {
    const id = region.name.toLowerCase().replace(/ /g, '-');
    return [
      id,
      {
        id,
        name: region.name,
        universalis: region.name.replace(/ /g, '-'),
        dataCentres: region.dataCentres.map(name => ({
          name,
          worlds: DATA_CENTRES[name].map(world => ({...world})),
        })),
      },
    ];
  }),
);

const REGION_IDS = [...REGIONS.keys()] as [string, ...string[]];

function marketRegion(id: string): MarketRegion | undefined {
  return REGIONS.get(id);
}

// Every world of a region.
function regionWorlds(region: MarketRegion) {
  return region.dataCentres.flatMap(dataCentre => dataCentre.worlds);
}

function marketRegions() {
  return [...REGIONS.values()];
}

export {
  DEFAULT_REGION,
  HOME_WORLD,
  MarketRegion,
  REGION_IDS,
  marketRegion,
  marketRegions,
  regionWorlds,
};
