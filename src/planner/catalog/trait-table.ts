import {ActionEffect, EffectKind, TraitEntry} from './catalog-model';

// The traits that change an action the catalog has, from the game's Trait
// sheet (TraitTransient for the text). The game data's recast and charges
// are those before any trait, and the effect tables are the level-100
// tooltips', so each trait says what it gives (recast, charges) or what
// the action was before it (`undo`). A trait's text rarely gives the
// earlier value; those come from the game wiki's notes on each action
// ("Duration is 10s prior to learning the Enhanced Reprisal trait"), checked
// against its patch history for later changes.

// The effects without the ones a trait added.
const without =
  (kind: EffectKind, status: string | null = null) =>
  (effects: ActionEffect[]) =>
    effects.filter(
      e => e.kind !== kind || (status !== null && e.status !== status),
    );

// The effects with a status's (or a kind's) values as before a trait.
const was =
  (
    match: string | EffectKind,
    values: {percent?: number; potency?: number; s?: number},
  ) =>
  (effects: ActionEffect[]) =>
    effects.map(e =>
      e.status === match || (e.status === null && e.kind === match)
        ? {
            ...e,
            percent: values.percent ?? e.percent,
            potency: values.potency ?? e.potency,
            durationMs: values.s === undefined ? e.durationMs : values.s * 1000,
          }
        : e,
    );

const both =
  (...steps: ((effects: ActionEffect[]) => ActionEffect[])[]) =>
  (effects: ActionEffect[]) =>
    steps.reduce((list, step) => step(list), effects);

const t = (
  action: number,
  traitId: number,
  trait: string,
  level: number,
  change: Omit<TraitEntry, 'action' | 'traitId' | 'trait' | 'level'>,
): TraitEntry => ({action, traitId, trait, level, ...change});

// One job's Enhanced Healing Magic, by its trait row.
const ehm = (
  traitId: number,
  actions: [number, (effects: ActionEffect[]) => ActionEffect[]][],
) =>
  actions.map(([action, undo]) =>
    t(action, traitId, 'Enhanced Healing Magic', 85, {undo}),
  );

const TRAITS: TraitEntry[] = [
  // Role actions.
  t(7531, 639, 'Enhanced Rampart', 94, {undo: without('healingReceived')}),
  t(7535, 640, 'Enhanced Reprisal', 98, {undo: was('Reprisal', {s: 10})}),
  t(7549, 641, 'Enhanced Feint', 98, {undo: was('Feint', {s: 10})}),
  t(7560, 643, 'Enhanced Addle', 98, {undo: was('Addle', {s: 10})}),
  t(7541, 642, 'Enhanced Second Wind', 94, {undo: was('heal', {potency: 500})}),
  t(7561, 644, 'Enhanced Swiftcast', 94, {recastMs: 40_000}),

  // Tanks.
  t(3540, 416, 'Enhanced Divine Veil', 88, {undo: without('heal')}),
  t(3542, 262, 'Enhanced Sheltron', 74, {undo: was('Sheltron', {s: 4})}),
  t(7382, 413, 'Enhanced Intervention', 82, {
    undo: both(
      without('mitigation', "Knight's Resolve"),
      without('regen', "Knight's Benediction"),
      was('Intervention', {s: 6}),
    ),
  }),
  t(7384, 414, 'Divine Magic Mastery II', 84, {undo: without('heal')}),
  t(16458, 414, 'Divine Magic Mastery II', 84, {undo: without('heal')}),
  t(16459, 414, 'Divine Magic Mastery II', 84, {undo: without('heal')}),
  t(40, 269, 'Enhanced Thrill of Battle', 78, {
    undo: without('healingReceived'),
  }),
  t(7388, 417, 'Enhanced Shake It Off', 76, {undo: without('heal')}),
  t(3552, 420, 'Enhanced Equilibrium', 84, {undo: without('regen')}),
  t(16464, 419, 'Enhanced Nascent Flash', 82, {
    undo: both(
      without('mitigation', 'Stem the Flow'),
      without('shield', 'Stem the Tide'),
      was('Nascent Glint', {s: 6}),
    ),
  }),
  t(16151, 425, 'Enhanced Aurora', 84, {charges: 2}),
  t(7386, 421, 'Enhanced Onslaught', 88, {charges: 3}),

  // Healers.
  t(3569, 310, 'Enhanced Asylum', 78, {undo: without('healingReceived')}),
  t(7432, 490, 'Enhanced Divine Benison', 88, {charges: 2}),
  t(3570, 625, 'Enhanced Tetragrammaton', 98, {charges: 2}),
  t(188, 313, 'Enhanced Sacred Soil', 78, {undo: without('regen')}),
  t(3585, 494, 'Enhanced Deployment Tactics', 88, {recastMs: 90_000}),
  t(16542, 629, 'Enhanced Recitation', 98, {recastMs: 60_000}),
  t(3606, 189, 'Hyper Lightspeed', 68, {recastMs: 60_000}),
  t(3614, 316, 'Enhanced Essential Dignity', 78, {charges: 2}),
  t(3614, 634, 'Enhanced Essential Dignity II', 98, {charges: 3}),
  t(16556, 500, 'Enhanced Celestial Intersection', 88, {charges: 2}),
  t(24298, 375, 'Enhanced Kerachole', 78, {undo: without('regen')}),
  t(24300, 378, 'Enhanced Zoe', 88, {recastMs: 90_000}),
  t(24294, 636, 'Enhanced Soteria', 94, {recastMs: 60_000}),
  t(24302, 638, 'Enhanced Physis II', 98, {undo: was('Autophysis', {s: 10})}),

  // Enhanced Healing Magic (85): the healers' potencies and barriers before.
  ...ehm(489, [
    [120, was('heal', {potency: 450})], // Cure
    [124, was('heal', {potency: 300})], // Medica
    [135, was('heal', {potency: 700})], // Cure II
    [137, was('Regen', {potency: 200})],
    [131, was('heal', {potency: 550})], // Cure III
    [
      133, // Medica II
      both(was('heal', {potency: 200}), was('Medica II', {potency: 100})),
    ],
    [16531, was('heal', {potency: 700})], // Afflatus Solace
    [16534, was('heal', {potency: 300})], // Afflatus Rapture
  ]),
  ...ehm(493, [
    [190, was('heal', {potency: 400})], // Physick
    [16548, was('heal', {potency: 150})], // Seraphic Veil
    [
      185, // Adloquium
      both(was('Galvanize', {percent: 125}), was('Catalyze', {percent: 125})),
    ],
    [186, was('Galvanize', {percent: 115})], // Succor
  ]),
  ...ehm(499, [
    [3594, was('heal', {potency: 450})], // Benefic
    [3600, was('heal', {potency: 300})], // Helios
    [3610, was('heal', {potency: 700})], // Benefic II
    [
      3595, // Aspected Benefic
      both(
        was('heal', {potency: 200}),
        was('Aspected Benefic', {potency: 200}),
      ),
    ],
    [
      3601, // Aspected Helios
      both(was('heal', {potency: 200}), was('Aspected Helios', {potency: 100})),
    ],
  ]),
  ...ehm(377, [
    [24284, was('heal', {potency: 400})], // Diagnosis
    [24285, was('Kardion', {potency: 130})], // Kardia
    [
      24291, // Eukrasian Diagnosis
      both(
        was('Eukrasian Diagnosis', {percent: 125}),
        was('Differential Diagnosis', {percent: 125}),
      ),
    ],
    [24292, was('Eukrasian Prognosis', {percent: 230})],
  ]),

  // DPS: the party mitigations (120s and 10% before), and their own.
  t(7405, 447, 'Enhanced Troubadour', 88, {recastMs: 90_000}),
  t(7405, 601, 'Enhanced Troubadour II', 98, {
    undo: was('Troubadour', {percent: 10}),
  }),
  t(16889, 452, 'Enhanced Tactician', 88, {recastMs: 90_000}),
  t(16889, 607, 'Enhanced Tactician II', 98, {
    undo: was('Tactician', {percent: 10}),
  }),
  t(16012, 456, 'Enhanced Shield Samba', 88, {recastMs: 90_000}),
  t(16012, 611, 'Enhanced Shield Samba II', 98, {
    undo: was('Shield Samba', {percent: 10}),
  }),
  t(24404, 385, 'Enhanced Arcane Crest', 84, {undo: without('regen')}),
  t(25799, 480, 'Enhanced Radiant Aegis', 88, {charges: 2}),

  // Other charges (the rotation as played, and the patch check).
  t(83, 438, 'Enhanced Life Surge', 88, {charges: 2}),
  t(110, 445, 'Enhanced Bloodletter', 84, {charges: 3}),
  t(117, 445, 'Enhanced Bloodletter', 84, {charges: 3}),
  t(2262, 279, 'Enhanced Shukuchi II', 74, {charges: 2}),
  t(2874, 292, 'Charged Action Mastery', 74, {charges: 3}),
  t(2890, 292, 'Charged Action Mastery', 74, {charges: 3}),
  t(2876, 450, 'Enhanced Reassemble', 84, {charges: 2}),
  t(7499, 443, 'Enhanced Meikyo Shisui', 76, {charges: 2}),
  t(7518, 485, 'Enhanced Acceleration', 88, {charges: 2}),
  t(16010, 254, 'Enhanced En Avant', 68, {charges: 2}),
  t(16010, 256, 'Enhanced En Avant II', 78, {charges: 3}),
  t(16498, 605, 'Enhanced Multiweapon', 94, {charges: 2}),
  t(16499, 605, 'Enhanced Multiweapon', 94, {charges: 2}),
  t(24380, 383, 'Tempered Soul', 78, {charges: 2}),
  t(24381, 383, 'Tempered Soul', 78, {charges: 2}),
  t(25762, 431, 'Enhanced Thunderclap', 84, {charges: 3}),
  t(34646, 529, 'Enhanced Slither', 84, {charges: 3}),
  t(35348, 540, 'Enhanced Pictomancy II', 86, {charges: 2}),
  t(35347, 545, 'Enhanced Pictomancy IV', 96, {charges: 3}),
  t(36951, 580, 'Enhanced Winged Glide', 84, {charges: 2}),
];

export {TRAITS};
