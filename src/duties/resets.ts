// The game's daily and weekly resets. Square Enix keeps them on UTC all year:
// the daily reset is at 15:00 UTC (also when the Frontline map changes), the
// weekly reset on Tuesdays at 08:00 UTC. Daylight saving time doesn't move
// them, so in local time they move instead: in Italy the daily reset is at
// 17:00 in summer (CEST) and 16:00 in winter (CET). Times leave here as UTC
// instants; whoever shows them converts to the reader's time zone.
// Source: https://ffxiv.consolegameswiki.com/wiki/Reset

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const DAILY_RESET_UTC_HOUR = 15;
const WEEKLY_RESET_UTC_HOUR = 8;
// Date.getUTCDay(): 0 is Sunday.
const WEEKLY_RESET_UTC_DAY = 2;

// A stretch of game time, from one reset to the next.
interface ResetPeriod {
  from: Date;
  until: Date;
}

// The game day `at` is in: from the last daily reset to the next.
function gameDayAt(at: Date): ResetPeriod {
  const offset = DAILY_RESET_UTC_HOUR * HOUR_MS;
  const from = Math.floor((at.getTime() - offset) / DAY_MS) * DAY_MS + offset;
  return {from: new Date(from), until: new Date(from + DAY_MS)};
}

// The game week `at` is in: from the last weekly reset to the next.
function gameWeekAt(at: Date): ResetPeriod {
  // The first weekly reset after 1970-01-01, a Thursday (day 4).
  const firstReset =
    ((WEEKLY_RESET_UTC_DAY - 4 + 7) % 7) * DAY_MS +
    WEEKLY_RESET_UTC_HOUR * HOUR_MS;
  const from =
    Math.floor((at.getTime() - firstReset) / WEEK_MS) * WEEK_MS + firstReset;
  return {from: new Date(from), until: new Date(from + WEEK_MS)};
}

export {DAY_MS, ResetPeriod, gameDayAt, gameWeekAt};
