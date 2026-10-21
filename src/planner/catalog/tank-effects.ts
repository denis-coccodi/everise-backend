import {EffectEntry, effect} from './action-catalog';

// The tanks' heals and mitigations, and the tank role actions, as the
// tooltips give them at level 100 (Dawntrail). Actions a trait replaces
// (Sentinel by Guardian at 92...) are kept for lower-level content.
const TANK_EFFECTS: EffectEntry[] = [
  // Role actions.
  {
    id: 7531, // Rampart
    effects: [
      effect('mitigation', 'self', 'Rampart', {percent: 20, s: 20}),
      effect('healingReceived', 'self', 'Rampart', {percent: 15, s: 20}),
    ],
  },
  {
    id: 7535, // Reprisal
    effects: [
      effect('mitigation', 'enemies', 'Reprisal', {percent: 10, s: 15}),
    ],
  },

  // Paladin.
  {
    id: 17, // Sentinel
    effects: [effect('mitigation', 'self', 'Sentinel', {percent: 30, s: 15})],
  },
  {
    id: 36920, // Guardian
    effects: [
      effect('mitigation', 'self', 'Guardian', {percent: 40, s: 15}),
      effect('shield', 'self', "Guardian's Will", {potency: 1000, s: 15}),
    ],
  },
  {
    id: 3540, // Divine Veil
    effects: [
      effect('shield', 'party', 'Divine Veil', {
        percent: 10,
        of: 'casterMaxHp',
        s: 30,
      }),
      effect('heal', 'party', null, {potency: 400}),
    ],
  },
  {
    id: 3541, // Clemency
    effects: [effect('heal', 'target', null, {potency: 1000})],
  },
  {
    id: 3542, // Sheltron
    effects: [effect('mitigation', 'self', 'Sheltron', {percent: 15, s: 6})],
  },
  {
    id: 25746, // Holy Sheltron
    effects: [
      effect('mitigation', 'self', 'Holy Sheltron', {percent: 15, s: 8}),
      effect('mitigation', 'self', "Knight's Resolve", {percent: 15, s: 4}),
      effect('regen', 'self', "Knight's Benediction", {potency: 250, s: 12}),
    ],
  },
  {
    id: 7382, // Intervention
    effects: [
      effect('mitigation', 'target', 'Intervention', {percent: 10, s: 8}),
      effect('mitigation', 'target', 'Intervention', {
        percent: 10,
        s: 8,
        condition: 'Rampart or Guardian active',
      }),
      effect('mitigation', 'target', "Knight's Resolve", {percent: 10, s: 4}),
      effect('regen', 'target', "Knight's Benediction", {potency: 250, s: 12}),
    ],
  },
  {
    id: 7385, // Passage of Arms
    effects: [
      effect('mitigation', 'party', 'Passage of Arms', {
        percent: 15,
        s: 18,
        condition: 'behind the paladin',
      }),
    ],
  },
  {
    id: 30, // Hallowed Ground
    effects: [effect('invulnerable', 'self', 'Hallowed Ground', {s: 10})],
  },
  {id: 7384, effects: [effect('heal', 'self', null, {potency: 400})]}, // Holy Spirit
  {id: 16458, effects: [effect('heal', 'self', null, {potency: 400})]}, // Holy Circle
  {id: 16459, effects: [effect('heal', 'self', null, {potency: 400})]}, // Confiteor

  // Warrior.
  {
    id: 40, // Thrill of Battle
    effects: [
      effect('maxHp', 'self', 'Thrill of Battle', {percent: 20, s: 10}),
      effect('healingReceived', 'self', 'Thrill of Battle', {
        percent: 20,
        s: 10,
      }),
    ],
  },
  {
    id: 44, // Vengeance
    effects: [effect('mitigation', 'self', 'Vengeance', {percent: 30, s: 15})],
  },
  {
    id: 36923, // Damnation
    effects: [
      effect('mitigation', 'self', 'Damnation', {percent: 40, s: 15}),
      effect('regen', 'self', 'Primeval Impulse', {
        potency: 300,
        s: 15,
        condition: 'when hit or when Damnation ends',
      }),
    ],
  },
  {
    id: 3551, // Raw Intuition
    effects: [
      effect('mitigation', 'self', 'Raw Intuition', {percent: 10, s: 6}),
      effect('heal', 'self', null, {
        potency: 400,
        condition: 'each weaponskill',
      }),
    ],
  },
  {
    id: 25751, // Bloodwhetting
    effects: [
      effect('mitigation', 'self', 'Bloodwhetting', {percent: 10, s: 8}),
      effect('heal', 'self', null, {
        potency: 400,
        condition: 'each weaponskill',
      }),
      effect('mitigation', 'self', 'Stem the Flow', {percent: 10, s: 4}),
      effect('shield', 'self', 'Stem the Tide', {potency: 400, s: 20}),
    ],
  },
  {
    id: 16464, // Nascent Flash
    effects: [
      effect('heal', 'self', null, {
        potency: 400,
        condition: 'each weaponskill',
      }),
      effect('heal', 'target', null, {
        potency: 400,
        condition: "each of the warrior's weaponskills",
      }),
      effect('mitigation', 'target', 'Nascent Glint', {percent: 10, s: 8}),
      effect('mitigation', 'target', 'Stem the Flow', {percent: 10, s: 4}),
      effect('shield', 'target', 'Stem the Tide', {potency: 400, s: 20}),
    ],
  },
  {
    id: 3552, // Equilibrium
    effects: [
      effect('heal', 'self', null, {potency: 1200}),
      effect('regen', 'self', 'Equilibrium', {potency: 200, s: 15}),
    ],
  },
  {
    id: 7388, // Shake It Off
    effects: [
      effect('shield', 'party', 'Shake It Off', {
        percent: 15,
        of: 'maxHp',
        s: 30,
      }),
      effect('regen', 'party', 'Shake It Off (Over Time)', {
        potency: 100,
        s: 15,
      }),
      effect('heal', 'party', null, {potency: 300}),
    ],
  },
  {
    id: 43, // Holmgang
    effects: [effect('invulnerable', 'self', 'Holmgang', {s: 10})],
  },
  {
    id: 42, // Storm's Path
    effects: [effect('heal', 'self', null, {potency: 250, condition: 'combo'})],
  },

  // Dark Knight.
  {
    id: 3636, // Shadow Wall
    effects: [
      effect('mitigation', 'self', 'Shadow Wall', {percent: 30, s: 15}),
    ],
  },
  {
    id: 36927, // Shadowed Vigil
    effects: [
      effect('mitigation', 'self', 'Shadowed Vigil', {percent: 40, s: 15}),
      effect('delayedHeal', 'self', 'Vigilant', {
        potency: 1200,
        s: 20,
        condition: 'below 50% HP or when it ends',
      }),
    ],
  },
  {
    id: 3634, // Dark Mind
    effects: [
      effect('mitigation', 'self', 'Dark Mind', {
        physical: 10,
        magic: 20,
        s: 10,
      }),
    ],
  },
  {
    id: 7393, // The Blackest Night
    effects: [
      effect('shield', 'target', 'Blackest Night', {
        percent: 25,
        of: 'maxHp',
        s: 7,
      }),
    ],
  },
  {
    id: 16471, // Dark Missionary
    effects: [
      effect('mitigation', 'party', 'Dark Missionary', {
        physical: 5,
        magic: 10,
        s: 15,
      }),
    ],
  },
  {
    id: 25754, // Oblation
    effects: [effect('mitigation', 'target', 'Oblation', {percent: 10, s: 10})],
  },
  {
    id: 3638, // Living Dead
    effects: [
      effect('invulnerable', 'self', 'Living Dead', {
        s: 10,
        condition: 'healed back to full HP within 10s, or KO',
      }),
    ],
  },
  {id: 3641, effects: [effect('heal', 'self', null, {potency: 500})]}, // Abyssal Drain
  {id: 3643, effects: [effect('heal', 'self', null, {potency: 500})]}, // Carve and Spit
  {
    id: 3632, // Souleater
    effects: [effect('heal', 'self', null, {potency: 300, condition: 'combo'})],
  },

  // Gunbreaker.
  {
    id: 16148, // Nebula
    effects: [effect('mitigation', 'self', 'Nebula', {percent: 30, s: 15})],
  },
  {
    id: 36935, // Great Nebula
    effects: [
      effect('mitigation', 'self', 'Great Nebula', {percent: 40, s: 15}),
      effect('maxHp', 'self', 'Great Nebula', {percent: 20, s: 15}),
    ],
  },
  {
    id: 16140, // Camouflage
    effects: [effect('mitigation', 'self', 'Camouflage', {percent: 10, s: 20})],
  },
  {
    id: 16151, // Aurora
    effects: [effect('regen', 'target', 'Aurora', {potency: 300, s: 18})],
  },
  {
    id: 16160, // Heart of Light
    effects: [
      effect('mitigation', 'party', 'Heart of Light', {
        physical: 5,
        magic: 10,
        s: 15,
      }),
    ],
  },
  {
    id: 16161, // Heart of Stone
    effects: [
      effect('mitigation', 'target', 'Heart of Stone', {percent: 15, s: 7}),
    ],
  },
  {
    id: 25758, // Heart of Corundum
    effects: [
      effect('mitigation', 'target', 'Heart of Corundum', {percent: 15, s: 8}),
      effect('mitigation', 'target', 'Clarity of Corundum', {
        percent: 15,
        s: 4,
      }),
      effect('delayedHeal', 'target', 'Catharsis of Corundum', {
        potency: 900,
        s: 20,
        condition: 'below 50% HP or when it ends',
      }),
    ],
  },
  {
    id: 16152, // Superbolide
    effects: [
      effect('invulnerable', 'self', 'Superbolide', {
        s: 10,
        condition: 'HP drops to 1',
      }),
    ],
  },
  {
    id: 16139, // Brutal Shell
    effects: [
      effect('heal', 'self', null, {potency: 200, condition: 'combo'}),
      effect('shield', 'self', 'Brutal Shell', {
        percent: 100,
        of: 'healed',
        s: 30,
        condition: 'combo',
      }),
    ],
  },
];

export {TANK_EFFECTS};
