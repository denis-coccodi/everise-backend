// Other groups' kills of a fight, from FFLogs' rankings (fastest first):
// FFLogs' shapes stay in this file.
const CLEARS_QUERY = `query Clears($encounter: Int!, $difficulty: Int) {
  worldData {
    encounter(id: $encounter) { fightRankings(difficulty: $difficulty) }
  }
}`;

interface FflogsRanking {
  report?: {code?: unknown; fightID?: unknown} | null;
}

// The ranked kills, as report code and pull id, in FFLogs' order, one per
// report.
function clearsOf(data: unknown) {
  const rankings = (
    data as {
      worldData?: {
        encounter?: {fightRankings?: {rankings?: FflogsRanking[]}} | null;
      };
    }
  )?.worldData?.encounter?.fightRankings?.rankings;
  if (!Array.isArray(rankings)) return [];
  const clears: {code: string; pullId: number}[] = [];
  for (const {report} of rankings) {
    const code = report?.code;
    const pullId = report?.fightID;
    if (typeof code !== 'string' || typeof pullId !== 'number') continue;
    if (clears.some(c => c.code === code)) continue;
    clears.push({code, pullId});
  }
  return clears;
}

export {CLEARS_QUERY, clearsOf};
