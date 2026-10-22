import {effect} from './action-catalog';
import {heal, healAndShield} from './effect-helpers';
import {EffectEntry} from './catalog-model';

// The Astrologian's and Sage's heals and mitigations as the tooltips give them at level 100
// (Dawntrail). Actions a trait replaces are kept for lower levels.
const AST_SGE_EFFECTS: EffectEntry[] = [
  // Astrologian.
  heal(3594, 500), // Benefic
  heal(3610, 800), // Benefic II
  heal(3600, 400, true), // Helios
  heal(7445, 400, true), // Lady of Crowns
  {
    id: 3595, // Aspected Benefic
    effects: [
      effect('heal', 'target', null, {potency: 250}),
      effect('regen', 'target', 'Aspected Benefic', {potency: 250, s: 15}),
    ],
  },
  {
    id: 3601, // Aspected Helios
    effects: [
      effect('heal', 'party', null, {potency: 250}),
      effect('regen', 'party', 'Aspected Helios', {potency: 150, s: 15}),
    ],
  },
  {
    id: 37030, // Helios Conjunction
    effects: [
      effect('heal', 'party', null, {potency: 250}),
      effect('regen', 'party', 'Helios Conjunction', {potency: 175, s: 15}),
    ],
  },
  {
    id: 3613, // Collective Unconscious
    effects: [
      effect('mitigation', 'party', 'Collective Unconscious', {
        percent: 10,
        s: 10,
      }),
      effect('regen', 'party', 'Wheel of Fortune', {potency: 100, s: 15}),
    ],
  },
  {
    id: 3614, // Essential Dignity
    effects: [
      effect('heal', 'target', null, {
        potency: 400,
        condition: 'up to 900 as the target has less HP (most at 30%)',
      }),
    ],
  },
  {
    id: 7439, // Earthly Star
    effects: [
      effect('heal', 'party', null, {
        potency: 720,
        condition: 'after 10s; 540 if detonated earlier',
      }),
    ],
  },
  {
    id: 8324, // Stellar Detonation
    effects: [
      effect('heal', 'party', null, {
        potency: 540,
        condition: '720 once the star has grown (10s)',
      }),
    ],
  },
  {
    id: 16553, // Celestial Opposition
    effects: [
      effect('heal', 'party', null, {potency: 200}),
      effect('regen', 'party', 'Opposition', {potency: 100, s: 15}),
    ],
  },
  healAndShield(16556, 'target', 200, 'Intersection', 200), // Celestial Intersection
  {
    id: 16557, // Horoscope
    effects: [
      effect('delayedHeal', 'party', 'Horoscope', {
        potency: 200,
        s: 10,
        condition: '400 (and 30s) after a Helios; when read again or it ends',
      }),
    ],
  },
  {
    id: 16559, // Neutral Sect
    effects: [
      effect('healingPotency', 'self', 'Neutral Sect', {percent: 20, s: 20}),
      // Its tooltip gives the barriers the two spells leave meanwhile.
      effect('shield', 'target', 'Neutral Sect', {
        percent: 250,
        of: 'healed',
        s: 30,
        condition: 'each Aspected Benefic for 20s',
        statusId: 1921,
      }),
      effect('shield', 'party', 'Neutral Sect', {
        percent: 125,
        of: 'healed',
        s: 30,
        condition: 'each Helios Conjunction for 20s',
        statusId: 1921,
      }),
    ],
  },
  {
    id: 25873, // Exaltation
    effects: [
      effect('mitigation', 'target', 'Exaltation', {percent: 10, s: 8}),
      effect('delayedHeal', 'target', 'Exaltation', {
        potency: 500,
        s: 8,
        condition: 'when it ends',
      }),
    ],
  },
  {
    id: 25874, // Macrocosmos
    effects: [
      effect('delayedHeal', 'party', 'Macrocosmos', {
        potency: 200,
        s: 15,
        condition:
          'plus 50% of damage taken meanwhile; when it ends or on Microcosmos',
      }),
    ],
  },
  {
    id: 37031, // Sun Sign
    effects: [effect('mitigation', 'party', 'Sun Sign', {percent: 10, s: 15})],
  },
  {
    id: 37027, // the Bole
    effects: [effect('mitigation', 'target', 'The Bole', {percent: 10, s: 15})],
  },
  {
    id: 37025, // the Spire
    effects: [effect('shield', 'target', 'The Spire', {potency: 400, s: 30})],
  },
  {
    id: 37028, // the Ewer
    effects: [effect('regen', 'target', 'The Ewer', {potency: 200, s: 15})],
  },
  {
    id: 37024, // the Arrow
    effects: [
      effect('healingReceived', 'target', 'The Arrow', {percent: 10, s: 15}),
    ],
  },

  // Sage.
  heal(24284, 450), // Diagnosis
  heal(24286, 300, true), // Prognosis
  heal(24296, 600), // Druochole
  heal(24299, 400, true), // Ixochole
  heal(24318, 600, true), // Pneuma
  healAndShield(
    24291,
    'target',
    300,
    'Eukrasian Diagnosis',
    180,
    'Differential Diagnosis',
  ), // Eukrasian Diagnosis
  healAndShield(24292, 'party', 100, 'Eukrasian Prognosis', 320), // Eukrasian Prognosis
  healAndShield(37034, 'party', 100, 'Eukrasian Prognosis', 360), // Eukrasian Prognosis II
  {
    id: 24285, // Kardia
    effects: [
      effect('heal', 'target', 'Kardion', {
        potency: 170,
        condition: "each of the sage's damage spells",
      }),
    ],
  },
  {
    id: 24288, // Physis
    effects: [effect('regen', 'party', 'Physis', {potency: 100, s: 15})],
  },
  {
    id: 24302, // Physis II
    effects: [
      effect('regen', 'party', 'Physis II', {potency: 130, s: 15}),
      effect('healingReceived', 'party', 'Autophysis', {percent: 10, s: 15}),
    ],
  },
  {
    id: 24298, // Kerachole
    effects: [
      effect('mitigation', 'party', 'Kerachole', {percent: 10, s: 15}),
      effect('regen', 'party', 'Kerachole', {potency: 100, s: 15}),
    ],
  },
  {
    id: 24300, // Zoe
    effects: [
      effect('healingPotency', 'self', 'Zoe', {
        percent: 50,
        s: 30,
        condition: 'next healing spell',
      }),
    ],
  },
  {
    id: 24301, // Pepsis
    effects: [
      effect('heal', 'party', null, {
        potency: 350,
        condition:
          'removes Eukrasian Prognosis (350) or Eukrasian Diagnosis (450)',
      }),
    ],
  },
  {
    id: 24303, // Taurochole
    effects: [
      effect('heal', 'target', null, {potency: 700}),
      effect('mitigation', 'target', 'Taurochole', {percent: 10, s: 15}),
    ],
  },
  {
    id: 24305, // Haima
    effects: [
      effect('shield', 'target', 'Haima', {
        potency: 300,
        s: 15,
        stacks: 5,
        condition: 'renewed each time it breaks',
      }),
      effect('delayedHeal', 'target', 'Haima', {
        potency: 150,
        condition: 'each stack left when it ends',
      }),
    ],
  },
  {
    id: 24310, // Holos
    effects: [
      ...healAndShield(24310, 'party', 300, 'Holos', 100).effects,
      effect('mitigation', 'party', 'Holos', {percent: 10, s: 20}),
    ],
  },
  {
    id: 24311, // Panhaima
    effects: [
      effect('shield', 'party', 'Panhaima', {
        potency: 200,
        s: 15,
        stacks: 5,
        condition: 'renewed each time it breaks',
      }),
      effect('delayedHeal', 'party', 'Panhaima', {
        potency: 100,
        condition: 'each stack left when it ends',
      }),
    ],
  },
  {
    id: 24317, // Krasis
    effects: [
      effect('healingReceived', 'target', 'Krasis', {percent: 20, s: 10}),
    ],
  },
  {
    id: 37035, // Philosophia
    effects: [
      effect('healingPotency', 'self', 'Philosophia', {percent: 20, s: 20}),
      effect('heal', 'party', 'Eudaimonia', {
        potency: 150,
        s: 20,
        condition: "each of the sage's spells",
      }),
    ],
  },
];

export {AST_SGE_EFFECTS};
