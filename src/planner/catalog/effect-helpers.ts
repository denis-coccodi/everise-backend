import {effect} from './action-catalog';
import {EffectEntry, EffectTarget} from './catalog-model';

// Shorthands for the effect tables. A plain heal names who it reaches:
// 'target' (one chosen player, or the user) or 'party' (everyone around).
const heal = (
  id: number,
  potency: number,
  reach: Extract<EffectTarget, 'target' | 'party'>,
): EffectEntry => ({
  id,
  effects: [effect('heal', reach, null, {potency})],
});

// A heal that also leaves a barrier of `percent` of the HP it restored
// (Adloquium's Galvanize, Holos...), and its critical heal's extra one.
const healAndShield = (
  id: number,
  target: 'target' | 'party',
  potency: number,
  status: string,
  percent: number,
  critical?: string,
): EffectEntry => ({
  id,
  effects: [
    effect('heal', target, null, {potency}),
    effect('shield', target, status, {percent, of: 'healed', s: 30}),
    ...(critical
      ? [
          effect('shield', target, critical, {
            percent,
            of: 'healed',
            s: 30,
            condition: 'critical heal',
          }),
        ]
      : []),
  ],
});

export {heal, healAndShield};
