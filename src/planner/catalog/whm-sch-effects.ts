import {EffectEntry, effect} from './action-catalog';
import {heal, healAndShield} from './effect-helpers';

// The White Mage's and Scholar's heals and mitigations as the tooltips give them at level 100
// (Dawntrail). Actions a trait replaces are kept for lower levels.
const WHM_SCH_EFFECTS: EffectEntry[] = [
  // White Mage.
  heal(120, 500), // Cure
  heal(124, 400, true), // Medica
  heal(131, 600, true), // Cure III
  heal(135, 800), // Cure II
  heal(3570, 700), // Tetragrammaton
  heal(3571, 400, true), // Assize
  heal(16531, 800), // Afflatus Solace
  heal(16534, 400, true), // Afflatus Rapture
  {
    id: 133, // Medica II
    effects: [
      effect('heal', 'party', null, {potency: 250}),
      effect('regen', 'party', 'Medica II', {potency: 150, s: 15}),
    ],
  },
  {
    id: 37010, // Medica III
    effects: [
      effect('heal', 'party', null, {potency: 250}),
      effect('regen', 'party', 'Medica III', {potency: 175, s: 15}),
    ],
  },
  {
    id: 137, // Regen
    effects: [effect('regen', 'target', 'Regen', {potency: 250, s: 18})],
  },
  {
    id: 3569, // Asylum
    effects: [
      effect('regen', 'party', 'Asylum', {potency: 100, s: 24}),
      effect('healingReceived', 'party', 'Asylum', {percent: 10, s: 24}),
    ],
  },
  {
    id: 140, // Benediction
    effects: [effect('heal', 'target', null, {percent: 100, of: 'maxHp'})],
  },
  {
    id: 7432, // Divine Benison
    effects: [
      effect('shield', 'target', 'Divine Benison', {potency: 500, s: 15}),
    ],
  },
  {
    id: 7433, // Plenary Indulgence
    effects: [
      effect('mitigation', 'party', 'Confession', {percent: 10, s: 10}),
      effect('heal', 'party', null, {
        potency: 200,
        condition: 'with Medica, Medica III, Cure III or Afflatus Rapture',
      }),
    ],
  },
  {
    id: 16536, // Temperance
    effects: [
      effect('mitigation', 'party', 'Temperance', {percent: 10, s: 20}),
      effect('healingPotency', 'self', 'Temperance', {
        percent: 20,
        s: 20,
        statusId: 1872,
      }),
    ],
  },
  {
    id: 25861, // Aquaveil
    effects: [effect('mitigation', 'target', 'Aquaveil', {percent: 15, s: 8})],
  },
  {
    id: 25862, // Liturgy of the Bell
    effects: [
      effect('heal', 'party', 'Liturgy of the Bell', {
        potency: 400,
        stacks: 5,
        s: 20,
        condition: 'each time the white mage takes damage',
      }),
      effect('delayedHeal', 'party', 'Liturgy of the Bell', {
        potency: 200,
        condition: 'each stack left when it ends',
      }),
    ],
  },
  {
    id: 37011, // Divine Caress
    effects: [
      effect('shield', 'party', 'Divine Caress', {potency: 400, s: 10}),
      effect('regen', 'party', 'Divine Aura', {
        potency: 200,
        s: 15,
        condition: 'when the barrier ends',
      }),
    ],
  },

  // Scholar.
  heal(189, 600), // Lustrate
  heal(190, 450), // Physick
  heal(3583, 400, true), // Indomitability
  heal(16543, 320, true), // Fey Blessing
  healAndShield(185, 'target', 300, 'Galvanize', 180, 'Catalyze'), // Adloquium
  healAndShield(186, 'party', 200, 'Galvanize', 160), // Succor
  healAndShield(37013, 'party', 200, 'Galvanize', 180), // Concitation
  healAndShield(37015, 'target', 360, 'Galvanize', 180, 'Catalyze'), // Manifestation
  healAndShield(37016, 'party', 240, 'Galvanize', 180), // Accession
  healAndShield(16548, 'target', 180, 'Seraphic Veil', 100), // Seraphic Veil
  healAndShield(16546, 'party', 250, 'Seraphic Veil', 100), // Consolation
  {
    id: 188, // Sacred Soil
    effects: [
      effect('mitigation', 'party', 'Sacred Soil', {percent: 10, s: 15}),
      effect('regen', 'party', 'Sacred Soil', {potency: 100, s: 15}),
    ],
  },
  {
    id: 3585, // Deployment Tactics
    effects: [
      effect('shield', 'party', 'Galvanize', {
        condition: "copies the target's Galvanize",
      }),
    ],
  },
  {
    id: 3587, // Dissipation
    effects: [
      effect('healingPotency', 'self', 'Dissipation', {percent: 20, s: 30}),
    ],
  },
  {
    id: 7434, // Excogitation
    effects: [
      effect('delayedHeal', 'target', 'Excogitation', {
        potency: 800,
        s: 45,
        condition: 'at 50% HP or below, or when it ends',
      }),
    ],
  },
  {
    id: 7437, // Aetherpact
    effects: [
      effect('regen', 'target', 'Fey Union', {
        potency: 300,
        condition: 'while held, using the Faerie Gauge',
      }),
    ],
  },
  {
    id: 16537, // Whispering Dawn
    effects: [
      effect('regen', 'party', 'Whispering Dawn', {potency: 80, s: 21}),
    ],
  },
  {
    id: 16538, // Fey Illumination
    effects: [
      effect('mitigation', 'party', 'Fey Illumination', {magic: 5, s: 20}),
      effect('healingPotency', 'party', 'Fey Illumination', {
        percent: 10,
        s: 20,
      }),
    ],
  },
  {
    id: 25867, // Protraction
    effects: [
      effect('maxHp', 'target', 'Protraction', {percent: 10, s: 10}),
      effect('healingReceived', 'target', 'Protraction', {percent: 10, s: 10}),
    ],
  },
  {
    id: 25868, // Expedient
    effects: [
      effect('mitigation', 'party', 'Desperate Measures', {percent: 10, s: 20}),
    ],
  },
  {
    id: 37014, // Seraphism
    effects: [effect('regen', 'party', 'Seraphism', {potency: 100, s: 20})],
  },
];

export {WHM_SCH_EFFECTS};
