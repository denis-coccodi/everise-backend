// Other groups' kills of a fight, from FFLogs' rankings: FFLogs' shapes
// stay in this file.
const CLEARS_QUERY = `query Clears($encounter: Int!, $difficulty: Int) {
  worldData {
    encounter(id: $encounter) { fightRankings(difficulty: $difficulty) }
  }
}`;

interface FflogsRanking {
  report?: {code?: unknown; fightID?: unknown; startTime?: unknown} | null;
}

// The ranked kills, as report code and pull id, one per report, the most
// recent first: FFLogs ranks the fastest first, and archives old reports
// (its API can't read them), so the newest are the ones still there, and
// the closest to the game as it is.
function clearsOf(data: unknown) {
  const rankings = (
    data as {
      worldData?: {
        encounter?: {fightRankings?: {rankings?: FflogsRanking[]}} | null;
      };
    }
  )?.worldData?.encounter?.fightRankings?.rankings;
  if (!Array.isArray(rankings)) return [];
  const started = (r: FflogsRanking) =>
    typeof r.report?.startTime === 'number' ? r.report.startTime : 0;
  const clears: {code: string; pullId: number}[] = [];
  for (const {report} of [...rankings].sort(
    (a, b) => started(b) - started(a),
  )) {
    const code = report?.code;
    const pullId = report?.fightID;
    if (typeof code !== 'string' || typeof pullId !== 'number') continue;
    if (clears.some(c => c.code === code)) continue;
    clears.push({code, pullId});
  }
  return clears;
}

export {CLEARS_QUERY, clearsOf};
