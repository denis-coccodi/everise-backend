// The game's data centres with public worlds, by region (ids from the
// game's World sheet, as XIVAPI and xivpf give them). Europe comes first:
// Everise is on Light (Odin), and Chaos is its neighbour.
const REGIONS = [
  {
    name: 'Europe',
    dataCentres: {
      Light: [
        {id: 402, name: 'Alpha'},
        {id: 36, name: 'Lich'},
        {id: 66, name: 'Odin'},
        {id: 56, name: 'Phoenix'},
        {id: 403, name: 'Raiden'},
        {id: 67, name: 'Shiva'},
        {id: 33, name: 'Twintania'},
        {id: 42, name: 'Zodiark'},
      ],
      Chaos: [
        {id: 80, name: 'Cerberus'},
        {id: 83, name: 'Louisoix'},
        {id: 71, name: 'Moogle'},
        {id: 39, name: 'Omega'},
        {id: 401, name: 'Phantom'},
        {id: 97, name: 'Ragnarok'},
        {id: 400, name: 'Sagittarius'},
        {id: 85, name: 'Spriggan'},
      ],
    },
  },
  {
    name: 'North America',
    dataCentres: {
      Aether: [
        {id: 73, name: 'Adamantoise'},
        {id: 79, name: 'Cactuar'},
        {id: 54, name: 'Faerie'},
        {id: 63, name: 'Gilgamesh'},
        {id: 40, name: 'Jenova'},
        {id: 65, name: 'Midgardsormr'},
        {id: 99, name: 'Sargatanas'},
        {id: 57, name: 'Siren'},
      ],
      Crystal: [
        {id: 91, name: 'Balmung'},
        {id: 34, name: 'Brynhildr'},
        {id: 74, name: 'Coeurl'},
        {id: 62, name: 'Diabolos'},
        {id: 81, name: 'Goblin'},
        {id: 75, name: 'Malboro'},
        {id: 37, name: 'Mateus'},
        {id: 41, name: 'Zalera'},
      ],
      Dynamis: [
        {id: 408, name: 'Cuchulainn'},
        {id: 411, name: 'Golem'},
        {id: 406, name: 'Halicarnassus'},
        {id: 409, name: 'Kraken'},
        {id: 407, name: 'Maduin'},
        {id: 404, name: 'Marilith'},
        {id: 410, name: 'Rafflesia'},
        {id: 405, name: 'Seraph'},
      ],
      Primal: [
        {id: 78, name: 'Behemoth'},
        {id: 93, name: 'Excalibur'},
        {id: 53, name: 'Exodus'},
        {id: 35, name: 'Famfrit'},
        {id: 95, name: 'Hyperion'},
        {id: 55, name: 'Lamia'},
        {id: 64, name: 'Leviathan'},
        {id: 77, name: 'Ultros'},
      ],
    },
  },
  {
    name: 'Japan',
    dataCentres: {
      Elemental: [
        {id: 90, name: 'Aegis'},
        {id: 68, name: 'Atomos'},
        {id: 45, name: 'Carbuncle'},
        {id: 58, name: 'Garuda'},
        {id: 94, name: 'Gungnir'},
        {id: 49, name: 'Kujata'},
        {id: 72, name: 'Tonberry'},
        {id: 50, name: 'Typhon'},
      ],
      Gaia: [
        {id: 43, name: 'Alexander'},
        {id: 69, name: 'Bahamut'},
        {id: 92, name: 'Durandal'},
        {id: 46, name: 'Fenrir'},
        {id: 59, name: 'Ifrit'},
        {id: 98, name: 'Ridill'},
        {id: 76, name: 'Tiamat'},
        {id: 51, name: 'Ultima'},
      ],
      Mana: [
        {id: 44, name: 'Anima'},
        {id: 23, name: 'Asura'},
        {id: 70, name: 'Chocobo'},
        {id: 47, name: 'Hades'},
        {id: 48, name: 'Ixion'},
        {id: 96, name: 'Masamune'},
        {id: 28, name: 'Pandaemonium'},
        {id: 61, name: 'Titan'},
      ],
      Meteor: [
        {id: 24, name: 'Belias'},
        {id: 82, name: 'Mandragora'},
        {id: 60, name: 'Ramuh'},
        {id: 29, name: 'Shinryu'},
        {id: 30, name: 'Unicorn'},
        {id: 52, name: 'Valefor'},
        {id: 31, name: 'Yojimbo'},
        {id: 32, name: 'Zeromus'},
      ],
    },
  },
  {
    name: 'Oceania',
    dataCentres: {
      Materia: [
        {id: 22, name: 'Bismarck'},
        {id: 21, name: 'Ravana'},
        {id: 86, name: 'Sephirot'},
        {id: 87, name: 'Sophia'},
        {id: 88, name: 'Zurvan'},
      ],
    },
  },
] as const;

// A region's data centres' names; over a union of regions, all of them.
type DataCentresOf<R> = R extends {dataCentres: infer D}
  ? keyof D & string
  : never;
// "Light" | "Chaos" | "Aether" | ...
type DataCentre = DataCentresOf<(typeof REGIONS)[number]>;

type World = {readonly id: number; readonly name: string};

const DATA_CENTRES = Object.fromEntries(
  REGIONS.flatMap(region => Object.entries(region.dataCentres)),
) as Record<DataCentre, readonly World[]>;

// Light first: the page's default.
const DATA_CENTRE_NAMES = Object.keys(DATA_CENTRES) as [
  DataCentre,
  ...DataCentre[],
];

// The regions and their data centres' names, in order, for the page's list.
const REGION_LIST = REGIONS.map(region => ({
  name: region.name,
  dataCentres: Object.keys(region.dataCentres) as DataCentre[],
}));

const WORLD_DATA_CENTRES = new Map(
  DATA_CENTRE_NAMES.flatMap(name =>
    DATA_CENTRES[name].map(world => [world.id, name] as const),
  ),
);

// The data centre a world belongs to.
function dataCentreOf(worldId: number): DataCentre | undefined {
  return WORLD_DATA_CENTRES.get(worldId);
}

export {DATA_CENTRES, DATA_CENTRE_NAMES, DataCentre, REGION_LIST, dataCentreOf};
