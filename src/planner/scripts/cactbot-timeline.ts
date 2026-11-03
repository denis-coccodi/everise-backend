import {FightScript, ScriptMechanic} from './script-model';

// A line of a cactbot timeline: `<time> "<name>" <Event> {...} [jump ...]`,
// or `<time> label "<label>"`. Names starting "--" are syncs, not shown.
const LINE = /^(\d+(?:\.\d+)?)\s+(?:label\s+"([^"]+)"|"([^"]*)"(.*))$/;
const IDS = /\bid:\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/;
const HEX = /["']([0-9A-Fa-f]+)["']/g;
// The fight's enrages, its DPS checks' too ("Hurricane Force (adds
// enrage)"): a wipe to one is the group's damage, not their mitigation.
const ENRAGE = /\benrage\b/i;

// Abilities the file was made ignoring (`# -ii B4D3 B4B2 ...`): the
// fight's sub-hits and repeats, which logs show but the script doesn't.
const IGNORED = /^#\s*-ii\s+(.*)$/;

// The mechanics in a cactbot timeline file (ui/raidboss/data/**/*.txt), in
// the file's order, every variant of each branch, with the title (the
// first heading). Comments, `hideall` and syncs are left out; a
// commented-out cast (`#Ability`) is still a mechanic. Also the ids only
// enrage lines have (an id cast as an enrage and as a mechanic marks
// neither), and the ids it ignores.
function parseTimeline(text: string): Omit<FightScript, 'zone'> {
  const ignored: number[] = [];
  let title: string | null = null;
  let phase: string | null = null;
  let block: string | null = null;
  const mechanics: ScriptMechanic[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const skipped = IGNORED.exec(line);
    if (skipped)
      ignored.push(...skipped[1].split(/\s+/).map(hex => parseInt(hex, 16)));
    if (line.startsWith('###')) {
      const heading = line.replace(/^#+\s*/, '');
      if (title === null) title = heading;
      else phase = heading.replace(/^Phase\s+\d+:\s*/i, '');
      continue;
    }
    const parsed = LINE.exec(line);
    if (!parsed) continue;
    const [, time, label, name, rest = ''] = parsed;
    if (label) block = label;
    if (label || name.startsWith('--') || !name.trim()) continue;
    mechanics.push({
      at: Math.round(Number(time) * 1000),
      name: name.replace(/\?+$/, '').trim(),
      ids: [...(IDS.exec(rest)?.[1] ?? '').matchAll(HEX)].map(m =>
        parseInt(m[1], 16),
      ),
      phase,
      block,
      enrage: ENRAGE.test(name),
    });
  }
  const ids = (enrage: boolean) =>
    new Set(mechanics.filter(m => m.enrage === enrage).flatMap(m => m.ids));
  const [enrages, others] = [ids(true), ids(false)];
  return {
    title: title ?? '',
    mechanics,
    enrageIds: [...enrages].filter(id => !others.has(id)),
    ignoredIds: [...new Set(ignored)].filter(id => !Number.isNaN(id)),
  };
}

export {parseTimeline};
