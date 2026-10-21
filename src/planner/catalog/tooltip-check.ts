import {ActionEffect} from './action-catalog';

// An action whose tooltip no longer has a number its effects give: a
// patch may have changed it, so the table needs a look.
interface TooltipChange {
  id: number;
  name: string;
  // The numbers looked for, as a tooltip writes them ("20%", "400", "15s").
  missing: string[];
}

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

function tooltipChanges(
  entries: {id: number; name: string; effects: ActionEffect[]}[],
  tooltips: Map<number, string>,
): TooltipChange[] {
  const changes: TooltipChange[] = [];
  for (const entry of entries) {
    const tooltip = tooltips.get(entry.id) ?? '';
    const missing = expected(entry.effects)
      .filter(n => !n.alternatives.some(text => contains(tooltip, text)))
      .map(n => n.text);
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

export {TooltipChange, tooltipChanges};
