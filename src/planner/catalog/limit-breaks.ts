import {effect} from './action-catalog';
import {EffectEntry} from './catalog-model';

const TANKS = ['PLD', 'WAR', 'DRK', 'GNB'];

// The tanks' Limit Breaks, by action, and who uses each: level 1 and 2 are
// any tank's, level 3 each job's own. The planner never plans one (the
// party's gauge decides when there is one), but keeps those a group used.
const LIMIT_BREAK_JOBS: Record<number, string[]> = {
  197: TANKS, // Shield Wall
  198: TANKS, // Stronghold
  199: ['PLD'], // Last Bastion
  4240: ['WAR'], // Land Waker
  4241: ['DRK'], // Dark Force
  17105: ['GNB'], // Gunmetal Soul
};

const level3 = (id: number, status: string): EffectEntry => ({
  id,
  effects: [effect('mitigation', 'party', status, {percent: 80, s: 8})],
});

// What each does: the share from the tooltips, the duration from the
// statuses in logs (34 ultimate kills, November 2026), shorter than the
// tooltips say (Stronghold 12s, not 15s; level 3 8s, not 12s). The level 3
// ones but Last Bastion have empty tooltips; they do as it does.
const LIMIT_BREAK_EFFECTS: EffectEntry[] = [
  {
    id: 197,
    effects: [
      effect('mitigation', 'party', 'Shield Wall', {percent: 20, s: 10}),
    ],
  },
  {
    id: 198,
    effects: [
      effect('mitigation', 'party', 'Stronghold', {percent: 40, s: 12}),
    ],
  },
  level3(199, 'Last Bastion'),
  level3(4240, 'Land Waker'),
  level3(4241, 'Dark Force'),
  level3(17105, 'Gunmetal Soul'),
];

export {LIMIT_BREAK_EFFECTS, LIMIT_BREAK_JOBS};
