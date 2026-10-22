import {Heal, StatusSpan} from './pull-timeline-model';

// FFLogs' action for heal-over-time ticks it merged: when several HoTs
// tick on a player at once, the game reports one sum, which FFLogs credits
// to its "Multiple Players" actor.
const MERGED_HOTS = 500_001;

// Credits FFLogs' merged HoT ticks to the healers whose HoTs were on the
// player. A HoT is a status that ticks on its own somewhere in the pull
// (FFLogs numbers those ticks by the status). With one such HoT on the
// player, the tick is all its healer's; with several, it's split by how
// big each one's own ticks are in this pull (evenly when it never ticked
// alone), and the shares are marked `estimated`. A tick with no known HoT
// on the player stays credited to no one.
function creditMergedHots(heals: Heal[], auras: StatusSpan[]): Heal[] {
  const sizes = typicalTicks(heals);
  const hots = auras.filter(
    span => span.source !== null && sizes.has(`${span.status}`),
  );
  return heals.flatMap(heal => {
    if (heal.action !== MERGED_HOTS || heal.source !== null) return [heal];
    const on = new Map<string, StatusSpan>();
    for (const span of hots) {
      if (
        span.target === heal.target &&
        span.from <= heal.at &&
        heal.at <= span.to
      ) {
        on.set(`${span.status}:${span.source}`, span);
      }
    }
    if (on.size === 0) return [heal];
    const spans = [...on.values()];
    const weights = spans.map(
      span =>
        sizes.get(`${span.status}:${span.source}`) ??
        sizes.get(`${span.status}`) ??
        1,
    );
    const amounts = split(heal.amount, weights);
    const overheals = split(heal.overheal, weights);
    return spans.map((span, i) => ({
      ...heal,
      source: span.source,
      pet: null,
      status: span.status,
      amount: amounts[i],
      overheal: overheals[i],
      estimated: spans.length > 1,
    }));
  });
}

// The median size (healing and overheal) of each HoT's own ticks, by
// "<status>:<healer>" and, across healers, by "<status>".
function typicalTicks(heals: Heal[]) {
  const ticks = new Map<string, number[]>();
  for (const heal of heals) {
    if (!heal.tick || heal.status === null || heal.source === null) continue;
    const size = heal.amount + heal.overheal;
    for (const key of [`${heal.status}:${heal.source}`, `${heal.status}`]) {
      ticks.set(key, [...(ticks.get(key) ?? []), size]);
    }
  }
  const medians = new Map<string, number>();
  for (const [key, sizes] of ticks) {
    const sorted = sizes.sort((a, b) => a - b);
    medians.set(key, Math.max(sorted[Math.floor(sorted.length / 2)], 1));
  }
  return medians;
}

// `total` in whole parts by `weights`; the last part takes what rounding
// left, so the parts add up to it.
function split(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map(weight => Math.floor((total * weight) / sum));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}

export {MERGED_HOTS, creditMergedHots};
