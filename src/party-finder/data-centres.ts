// The data centres the Party Finder page follows, with their worlds (ids
// from the game's World sheet, as XIVAPI and xivpf give them). Everise is on
// Light (Odin); Chaos is Light's neighbour in Europe.
const DATA_CENTRES = {
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
} as const;

type DataCentre = keyof typeof DATA_CENTRES;

const DATA_CENTRE_NAMES = Object.keys(DATA_CENTRES) as [
  DataCentre,
  ...DataCentre[],
];

// The data centre a world belongs to, among the ones followed.
function dataCentreOf(worldId: number): DataCentre | undefined {
  return DATA_CENTRE_NAMES.find(name =>
    DATA_CENTRES[name].some(world => world.id === worldId),
  );
}

export {DATA_CENTRES, DATA_CENTRE_NAMES, DataCentre, dataCentreOf};
