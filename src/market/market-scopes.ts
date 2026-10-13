import {DATA_CENTRES, DATA_CENTRE_NAMES, REGION_LIST} from '../party-finder';

// Where prices are read: a data centre (every world on it) or one world.
// Ids are the names in lower case ("light", "odin"), as links carry them;
// Universalis takes the names themselves.
interface MarketScope {
  id: string;
  name: string;
  kind: 'dataCentre' | 'world';
}

// Everise's home world: where the page starts.
const DEFAULT_SCOPE = 'odin';

const SCOPES = new Map<string, MarketScope>(
  DATA_CENTRE_NAMES.flatMap(dataCentre => [
    [
      dataCentre.toLowerCase(),
      {id: dataCentre.toLowerCase(), name: dataCentre, kind: 'dataCentre'},
    ],
    ...DATA_CENTRES[dataCentre].map(
      world =>
        [
          world.name.toLowerCase(),
          {id: world.name.toLowerCase(), name: world.name, kind: 'world'},
        ] as const,
    ),
  ]),
);

const SCOPE_IDS = [...SCOPES.keys()] as [string, ...string[]];

function marketScope(id: string): MarketScope | undefined {
  return SCOPES.get(id);
}

// The data centres and their worlds, by region, for the page's picker.
function scopeList() {
  return REGION_LIST.map(region => ({
    name: region.name,
    dataCentres: region.dataCentres.map(name => ({
      id: name.toLowerCase(),
      name,
      worlds: DATA_CENTRES[name].map(world => ({
        id: world.name.toLowerCase(),
        name: world.name,
      })),
    })),
  }));
}

export {DEFAULT_SCOPE, MarketScope, SCOPE_IDS, marketScope, scopeList};
