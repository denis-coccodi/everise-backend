import {Duty, DutyGroup, Job, Roulette} from '../duties';

interface DutyData {
  groups: DutyGroup<Duty & {activeFrontline?: boolean}>[];
  roulettes: Roulette[];
  jobs: Job[];
}

// What the client says the reels landed on: ids only. The card shown in the
// feed is built from the backend's own duty data (see buildRouletteCard), so a
// post can only ever show a real result.
interface RouletteResultInput {
  // The first reel: a duty group's name, or one of the picked types.
  type: string;
  // The second reel: a duty or a roulette, by id.
  candidate: {kind: 'duty' | 'roulette'; id: number};
  // The third reel.
  mode: string;
  // The job dealt by "dealer's choice".
  jobId?: number;
}

export {DutyData, RouletteResultInput};
