import {DAY_MS, ResetPeriod, gameDayAt} from './resets';

// The Frontline daily challenge plays one map a day, in a fixed cycle that the
// game data doesn't contain, so it is kept here and computed without any API
// call. Source: the community wiki's rotation template,
// https://ffxiv.consolegameswiki.com/wiki/Template:Current_Frontline_map
// (last checked 2026-10-04, game version 7.56). When a patch adds a map or
// changes the order, update ROTATION and ROTATION_START together.
//
// Names match the duties' names in the game data.
const ROTATION = [
  'Seal Rock (Seize)',
  'the Fields of Glory (Shatter)',
  'Onsal Hakair (Danshig Naadam)',
  'Worqor Chirteh (Triumph)',
  'Seal Rock (Seize)',
  'the Borderland Ruins (Secure)',
  'Onsal Hakair (Danshig Naadam)',
  'Worqor Chirteh (Triumph)',
];

// The start of a day on which ROTATION[0] was the map. The map changes with
// the daily reset (see resets.ts).
const ROTATION_START = Date.UTC(2025, 10, 13, 15);

interface FrontlineDay extends ResetPeriod {
  map: string;
}

// The Frontline map in play at `at`, and the day it is in play.
function frontlineMapAt(at: Date): FrontlineDay {
  const {from, until} = gameDayAt(at);
  const day = Math.round((from.getTime() - ROTATION_START) / DAY_MS);
  const index = ((day % ROTATION.length) + ROTATION.length) % ROTATION.length;

  return {map: ROTATION[index], from, until};
}

// The map in play at `at`, followed by the next days' maps.
function frontlineSchedule(at: Date, days: number): FrontlineDay[] {
  return Array.from({length: days}, (_, i) =>
    frontlineMapAt(new Date(at.getTime() + i * DAY_MS))
  );
}

function isSameMap(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

export {FrontlineDay, frontlineMapAt, frontlineSchedule, isSameMap};
