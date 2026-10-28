import {ActionEffect} from './catalog-model';
import {TooltipChange} from './catalog-model';

// The numbers a tooltip should have for these effects. A 100% often comes
// in words ("all of a target's HP", "equaling the HP restored"), so it
// isn't looked for; a mitigation may come as what's left ("only suffer
// 90%").
function expected(effects: ActionEffect[]) {
  const numbers: {text: string; alternatives: string[]}[] = [];
  const add = (text: string, ...alternatives: string[]) =>
    numbers.push({text, alternatives: [text, ...alternatives]});
  for (const e of effects) {
    for (const value of [e.percent, e.physical, e.magic]) {
      if (value === null || value === 100) continue;
      const rest = e.kind === 'mitigation' ? [`${100 - value}%`] : [];
      add(`${value}%`, `${value}％`, ...rest);
    }
    if (e.potency !== null) {
      add(String(e.potency), e.potency.toLocaleString('en-US'));
    }
    if (e.durationMs !== null) add(`${e.durationMs / 1000}s`);
    if (e.stacks !== null) add(`${e.stacks} stacks`);
  }
  return numbers;
}

// Numbers of the tables that come from elsewhere than the action's tooltip,
// by action, each with where it comes from: they aren't looked for.
const NOT_IN_TOOLTIP: Record<number, string[]> = {
  22: ['20%'], // Bulwark: a block's, from the shield (consolegameswiki)
  // Dark Knight's MP: the tooltips say only "restores MP" (consolegameswiki).
  3625: ['600'], // Blood Weapon
  7390: ['600'], // Delirium
  3623: ['600'], // Syphon Strike
  3643: ['600'], // Carve and Spit
};

function tooltipChanges(
  entries: {id: number; name: string; effects: ActionEffect[]}[],
  tooltips: Map<number, string>,
  statusNames: Map<number, string>,
): TooltipChange[] {
  const changes: TooltipChange[] = [];
  for (const entry of entries) {
    const tooltip = tooltips.get(entry.id) ?? '';
    const elsewhere = NOT_IN_TOOLTIP[entry.id] ?? [];
    const missing = expected(entry.effects)
      .filter(n => !elsewhere.includes(n.text))
      .filter(n => !n.alternatives.some(text => contains(tooltip, text)))
      .map(n => n.text);
    for (const e of entry.effects) {
      if (e.statusId !== null && statusNames.get(e.statusId) !== e.status) {
        missing.push(`status ${e.statusId} "${e.status}"`);
      }
    }
    if (missing.length) {
      changes.push({
        id: entry.id,
        name: entry.name,
        missing: [...new Set(missing)],
      });
    }
  }
  return changes;
}

// The number as a whole: "10%" isn't found in "110%", nor "15s" in "115s".
function contains(tooltip: string, text: string) {
  const at = (from: number): boolean => {
    const i = tooltip.indexOf(text, from);
    if (i < 0) return false;
    return /[\d,.]/.test(tooltip[i - 1] ?? '') ? at(i + 1) : true;
  };
  return at(0);
}

export {tooltipChanges};
