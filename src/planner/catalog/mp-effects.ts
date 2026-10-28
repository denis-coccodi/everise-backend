import {effect} from './action-catalog';
import {EffectEntry} from './catalog-model';

// What gives MP back, for the planner's MP: `percent` of max MP, or
// `potency` MP when the tooltip has no number (Dark Knight's 600, from
// consolegameswiki, so the refresh doesn't look for it: NOT_IN_TOOLTIP).
// Lucid Dreaming's is an `mpRegen`: its tooltip potency, worth 10 MP, a
// 3s tick.
const mp = (id: number, percent: number): EffectEntry => ({
  id,
  effects: [effect('mp', 'self', null, {percent})],
});

const MP_EFFECTS: EffectEntry[] = [
  {
    id: 7562, // Lucid Dreaming: 550 MP a tick, 3,850 in all
    effects: [
      effect('mpRegen', 'self', 'Lucid Dreaming', {potency: 55, s: 21}),
    ],
  },
  mp(3571, 5), // Assize
  mp(166, 20), // Aetherflow
  // The Addersgall heals.
  mp(24296, 7), // Druochole
  mp(24298, 7), // Kerachole
  mp(24299, 7), // Ixochole
  mp(24303, 7), // Taurochole
  // Dark Knight.
  {
    id: 3625, // Blood Weapon
    effects: [
      effect('mp', 'self', null, {
        potency: 600,
        stacks: 3,
        condition: 'each weaponskill or spell',
      }),
    ],
  },
  {
    id: 7390, // Delirium (Blood Weapon's stacks too)
    effects: [
      effect('mp', 'self', null, {
        potency: 600,
        stacks: 3,
        condition: 'each weaponskill or spell',
      }),
    ],
  },
  {
    id: 3623, // Syphon Strike
    effects: [effect('mp', 'self', null, {potency: 600, condition: 'combo'})],
  },
  {
    id: 3643, // Carve and Spit
    effects: [effect('mp', 'self', null, {potency: 600})],
  },
];

export {MP_EFFECTS};
