import {DataCentre} from '../party-finder';

// The data centres FFXIV Venues lists venues on (it has none in Japan).
const VENUE_DATA_CENTRES = [
  'Light',
  'Chaos',
  'Aether',
  'Crystal',
  'Dynamis',
  'Primal',
  'Materia',
] as const satisfies readonly DataCentre[];

export {VENUE_DATA_CENTRES};
