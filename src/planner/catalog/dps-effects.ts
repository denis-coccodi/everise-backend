import {EffectEntry, effect} from './action-catalog';
import {heal} from './effect-helpers';

// A party-wide mitigation (Troubadour, Tactician, Shield Samba...).
const partyMitigation = (
  id: number,
  status: string,
  percent: number,
  s: number,
): EffectEntry => ({
  id,
  effects: [effect('mitigation', 'party', status, {percent, s})],
});

// A barrier of a share of the user's max HP.
const selfShield = (
  id: number,
  status: string,
  percent: number,
  s: number,
): EffectEntry => ({
  id,
  effects: [effect('shield', 'self', status, {percent, of: 'maxHp', s})],
});

// The DPS jobs' heals and mitigations, and the melee, ranged and caster
// role actions, as the tooltips give them at level 100 (Dawntrail).
const DPS_EFFECTS: EffectEntry[] = [
  // Role actions.
  {
    id: 7549, // Feint
    effects: [
      effect('mitigation', 'enemies', 'Feint', {physical: 10, magic: 5, s: 15}),
    ],
  },
  {
    id: 7560, // Addle
    effects: [
      effect('mitigation', 'enemies', 'Addle', {physical: 5, magic: 10, s: 15}),
    ],
  },
  {id: 7541, effects: [effect('heal', 'self', null, {potency: 800})]}, // Second Wind

  // Monk.
  {
    id: 7394, // Riddle of Earth
    effects: [
      effect('mitigation', 'self', 'Riddle of Earth', {percent: 20, s: 10}),
      effect('regen', 'self', "Earth's Resolve", {
        potency: 100,
        s: 15,
        condition: 'when hit',
      }),
    ],
  },
  {
    id: 65, // Mantra
    effects: [
      effect('healingReceived', 'party', 'Mantra', {percent: 10, s: 15}),
    ],
  },
  {
    id: 36944, // Earth's Reply
    effects: [
      effect('heal', 'party', null, {
        potency: 300,
        condition: "500 under Earth's Resolve",
      }),
    ],
  },

  // Ninja, Samurai, Reaper.
  selfShield(2241, 'Shade Shift', 20, 20),
  {
    id: 7498, // Third Eye
    effects: [
      effect('mitigation', 'self', 'Third Eye', {
        percent: 10,
        s: 4,
        condition: 'next attack',
      }),
    ],
  },
  {
    id: 36962, // Tengentsu
    effects: [
      effect('mitigation', 'self', 'Tengentsu', {
        percent: 10,
        s: 4,
        condition: 'next attack',
      }),
      effect('mitigation', 'self', "Tengentsu's Foresight", {
        percent: 10,
        s: 9,
        condition: 'when hit',
      }),
      effect('regen', 'self', "Tengentsu's Foresight", {
        potency: 200,
        s: 9,
        condition: 'when hit',
      }),
    ],
  },
  {
    id: 24404, // Arcane Crest
    effects: [
      effect('shield', 'self', 'Crest of Time Borrowed', {
        percent: 10,
        of: 'maxHp',
        s: 5,
      }),
      effect('regen', 'party', 'Crest of Time Returned', {
        potency: 50,
        s: 15,
        condition: 'when the barrier breaks',
      }),
    ],
  },

  // Bard, Machinist, Dancer.
  partyMitigation(7405, 'Troubadour', 15, 15),
  partyMitigation(16889, 'Tactician', 15, 15),
  partyMitigation(16012, 'Shield Samba', 15, 15),
  {
    id: 7408, // Nature's Minne
    effects: [
      effect('healingReceived', 'party', "Nature's Minne", {
        percent: 15,
        s: 15,
      }),
    ],
  },
  {
    id: 2887, // Dismantle
    effects: [
      effect('mitigation', 'enemies', 'Dismantled', {percent: 10, s: 10}),
    ],
  },
  heal(16015, 300, true), // Curing Waltz
  {
    id: 16014, // Improvisation
    effects: [effect('regen', 'party', 'Improvisation', {potency: 100, s: 15})],
  },
  {
    id: 25789, // Improvised Finish
    effects: [
      effect('shield', 'party', 'Improvised Finish', {
        percent: 5,
        of: 'maxHp',
        s: 30,
        condition: 'up to 10% with 4 stacks of Rising Rhythm',
      }),
    ],
  },

  // Black Mage, Summoner, Red Mage, Pictomancer.
  selfShield(157, 'Manaward', 30, 20),
  selfShield(25799, 'Radiant Aegis', 20, 30),
  heal(16230, 400), // Physick
  heal(36997, 500, true), // Lux Solaris
  {
    id: 25857, // Magick Barrier
    effects: [
      effect('mitigation', 'party', 'Magick Barrier', {magic: 10, s: 10}),
      effect('healingReceived', 'party', 'Magick Barrier', {
        percent: 5,
        s: 10,
      }),
    ],
  },
  heal(7514, 350), // Vercure
  selfShield(34685, 'Tempera Coat', 20, 10),
  {
    id: 34686, // Tempera Grassa
    effects: [
      effect('shield', 'party', 'Tempera Grassa', {
        percent: 10,
        of: 'maxHp',
        s: 10,
      }),
    ],
  },
  heal(34681, 400, true), // Star Prism
];

export {DPS_EFFECTS};
