import {DATA_CENTRES, DATA_CENTRE_NAMES, DataCentre} from '../party-finder';
import {RelayMessage} from './relay-message';

// Every public world's data centre, by its name.
const WORLDS = new Map(
  DATA_CENTRE_NAMES.flatMap(dataCentre =>
    DATA_CENTRES[dataCentre].map(world => [world.name, dataCentre] as const),
  ),
);
const WORD = /[A-Za-z]+/g;

// When a hunt train starts: the first Discord time in its text
// (<t:1791982446:R>), or when it was posted.
function trainStartsAt(message: RelayMessage) {
  const seconds = /<t:(\d+)(?::[tTdDfFR])?>/.exec(message.content)?.[1];
  return new Date(seconds ? Number(seconds) * 1000 : message.postedAt);
}

// The data centre of the world a train is on, as its text names it: a
// world in brackets first (Centurio's "**[Odin]**"), else `fallback` (the
// channel's, as set up), else any world named ("Omega" is also a raid's
// name, hence last).
function trainDataCentre(
  message: RelayMessage,
  fallback: DataCentre | undefined,
): DataCentre | undefined {
  for (const [, name] of message.content.matchAll(/\[([A-Za-z]+)\]/g)) {
    const dataCentre = WORLDS.get(name);
    if (dataCentre) return dataCentre;
  }
  if (fallback) return fallback;
  for (const [word] of message.content.matchAll(WORD)) {
    const dataCentre = WORLDS.get(word);
    if (dataCentre) return dataCentre;
  }
  return undefined;
}

export {trainDataCentre, trainStartsAt};
