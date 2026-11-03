import {Doc} from '../../db';

// A mechanic of a fight's script, as cactbot's timeline has it: when it
// comes (ms on the timeline's own clock, which assumes a typical group: a
// phase pushed sooner comes sooner), its name, the game's ability ids that
// cast it, the phase and the label it's under (a variant, a branch; null on
// the main line), and whether it's the fight's enrage.
interface ScriptMechanic {
  at: number;
  name: string;
  ids: number[];
  phase: string | null;
  block: string | null;
  enrage: boolean;
}

// A fight's script: its game zone (TerritoryType id, as FFLogs gives each
// fight), its title, and every mechanic in the file's order (every variant
// of each branch: a kill shows which way a fight went). `enrageIds` are the
// ability ids only its enrages (DPS checks' too) are cast with;
// `ignoredIds` the ones it knows but leaves out (sub-hits, repeats): with
// the mechanics' ids, what a log of the fight should mostly show.
interface FightScript {
  zone: number;
  title: string;
  mechanics: ScriptMechanic[];
  enrageIds: number[];
  ignoredIds: number[];
}

// Where a script came from: cactbot's commit and the file's path in it.
interface ScriptSource {
  commit: string;
  path: string;
}

// Kept per zone (its id), with where it came from and when it was read.
interface ScriptDoc extends Doc, FightScript {
  source: ScriptSource;
  readAt: string;
}

export {FightScript, ScriptDoc, ScriptMechanic, ScriptSource};
