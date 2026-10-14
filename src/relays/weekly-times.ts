// The game's resets, all at fixed UTC times.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

// The weekly reset: Tuesday 08:00 UTC. 2026-01-06 was a Tuesday.
const A_WEEKLY_RESET = Date.UTC(2026, 0, 6, 8);
// The daily reset (duties, roulettes, beast tribes) at 15:00 UTC, and the
// Grand Company's supply and provisioning missions at 20:00 UTC.
const DAILY_RESET_HOUR = 15;
const GRAND_COMPANY_RESET_HOUR = 20;
// The Fashion Report's judging opens on Friday 08:00 UTC, three days into
// the week, and closes with the weekly reset.
const JUDGING_OPENS_MS = 3 * DAY_MS;

// The weekly reset that started the week `at` is in.
function weekStart(at: Date) {
  const since = at.getTime() - A_WEEKLY_RESET;
  return new Date(A_WEEKLY_RESET + Math.floor(since / WEEK_MS) * WEEK_MS);
}

// The first time after `at` that it's `hour`:00 UTC.
function nextDailyAt(at: Date, hour: number) {
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const today = day + hour * HOUR_MS;
  return new Date(today > at.getTime() ? today : today + DAY_MS);
}

// When the next of each reset comes.
function nextResets(at: Date) {
  return {
    daily: nextDailyAt(at, DAILY_RESET_HOUR),
    weekly: new Date(weekStart(at).getTime() + WEEK_MS),
    grandCompany: nextDailyAt(at, GRAND_COMPANY_RESET_HOUR),
  };
}

// The days a Fashion Report posted at `postedAt` is for: that week's
// judging, Friday to the weekly reset.
function fashionReportDays(postedAt: Date) {
  const start = weekStart(postedAt).getTime();
  return {
    validFrom: new Date(start + JUDGING_OPENS_MS),
    validUntil: new Date(start + WEEK_MS),
  };
}

// The days an Island Sanctuary season posted at `postedAt` is for: its
// whole week, reset to reset (it's posted just after the reset).
function islandSeasonDays(postedAt: Date) {
  const start = weekStart(postedAt).getTime();
  return {validFrom: new Date(start), validUntil: new Date(start + WEEK_MS)};
}

// When the next Fashion Report judging opens after `at` (this week's,
// before Friday).
function nextJudgingAt(at: Date) {
  const thisWeek = weekStart(at).getTime() + JUDGING_OPENS_MS;
  return new Date(thisWeek > at.getTime() ? thisWeek : thisWeek + WEEK_MS);
}

export {fashionReportDays, islandSeasonDays, nextJudgingAt, nextResets};
