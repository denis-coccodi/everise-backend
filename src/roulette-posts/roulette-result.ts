import {RouletteCard} from '../articles';
import {Duty, DutyGroup, Job, Roulette} from '../duties';
import {InvalidRouletteResultError} from '../errors';

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

interface DutyData {
  groups: DutyGroup<Duty & {activeFrontline?: boolean}>[];
  roulettes: Roulette[];
  jobs: Job[];
}

// The roulette's picked types and party settings. Keep in step with the
// frontend's roulette-engine.ts, which offers them.
const ROULETTES_TYPE = 'Duty Roulettes';
const PVP_TYPE = 'PvP';
const GOLD_SAUCER_TYPE = 'Gold Saucer';
const SAME_JOB = 'Everyone on the same job';
const DEALERS_CHOICE = "Everyone on the same job: dealer's choice";
const AWKTRAIL_MIN_LEVEL = 50;

type Candidate =
  | {kind: 'duty'; duty: Duty}
  | {kind: 'roulette'; roulette: Roulette};

function findCandidate(input: RouletteResultInput, data: DutyData): Candidate {
  const {type, candidate} = input;
  const dutyIn = (group: string) =>
    data.groups
      .find(g => g.name === group)
      ?.duties.find(d => d.id === candidate.id);
  const roulette = data.roulettes.find(r => r.id === candidate.id);

  if (candidate.kind === 'roulette' && roulette) {
    const fits =
      (type === ROULETTES_TYPE && !roulette.pvp && !roulette.goldSaucer) ||
      (type === PVP_TYPE && roulette.pvp) ||
      (type === GOLD_SAUCER_TYPE && roulette.goldSaucer);
    if (fits) return {kind: 'roulette', roulette};
  }
  if (candidate.kind === 'duty' && type !== ROULETTES_TYPE) {
    const duty = dutyIn(type);
    // Frontline maps aren't queued one by one; the daily challenge is.
    if (duty && !(type === PVP_TYPE && duty.pvpType === 'Frontline')) {
      return {kind: 'duty', duty};
    }
  }
  throw new InvalidRouletteResultError(
    "That duty isn't one the roulette can land on."
  );
}

// The party settings a candidate can land on: the same rules as the third reel.
function runModes(candidate: Candidate, type: string, canDeal: boolean) {
  const modes: string[] = [];
  if (candidate.kind === 'duty') {
    const {duty} = candidate;
    if (duty.finder !== '') {
      if (duty.minimumIL) modes.push('Min IL + Silence Echo');
      if (duty.unrestrictedParty) {
        modes.push('Unsynced');
        if (duty.level >= AWKTRAIL_MIN_LEVEL) modes.push('Awktrail');
      }
      if (duty.joinPartyInProgress) modes.push('Join Party in Progress');
    }
    if (type !== GOLD_SAUCER_TYPE) {
      modes.push(SAME_JOB);
      if (canDeal) modes.push(DEALERS_CHOICE);
    }
  } else if (candidate.roulette.joinPartyInProgress) {
    modes.push('Join Party in Progress');
  }
  modes.push('Regular');
  return modes;
}

// Checks a result against the duty data and builds its card.
function buildRouletteCard(
  input: RouletteResultInput,
  data: DutyData,
  guest: boolean
): RouletteCard {
  const candidate = findCandidate(input, data);
  const dealable = data.jobs.filter(job => !job.limited);

  if (
    !runModes(candidate, input.type, dealable.length > 0).includes(input.mode)
  ) {
    throw new InvalidRouletteResultError(
      "Those party settings aren't possible for that duty."
    );
  }

  let job: RouletteCard['job'] = null;
  if (input.mode === DEALERS_CHOICE) {
    const dealt = dealable.find(j => j.id === input.jobId);
    if (!dealt) {
      throw new InvalidRouletteResultError("Dealer's choice needs a job.");
    }
    job = {name: dealt.name, icon: dealt.icon};
  }

  const mode = job ? `${SAME_JOB}: ${job.name}` : input.mode;

  if (candidate.kind === 'duty') {
    const {duty} = candidate;
    return {
      type: input.type,
      name: duty.name,
      detail: [
        `Lv. ${duty.level}`,
        duty.itemLevel ? `i${duty.itemLevel}` : '',
        duty.expansion,
      ]
        .filter(Boolean)
        .join(' · '),
      mode,
      dutyUnknown: false,
      image: duty.image ?? null,
      job,
      guest,
    };
  }

  const {roulette} = candidate;
  // The Frontline daily challenge plays the day's map, which is known. Not
  // "Today": the post is still read once the map has changed.
  const frontline =
    roulette.pvp && roulette.name.includes('Frontline')
      ? data.groups.flatMap(g => g.duties).find(d => d.activeFrontline)
      : undefined;
  return {
    type: input.type,
    name: roulette.name,
    detail: frontline
      ? `Map of the day: ${frontline.name}`
      : [roulette.dutyType, 'the game picks the duty']
          .filter(Boolean)
          .join(' · '),
    mode,
    dutyUnknown: !frontline,
    image: roulette.image ?? null,
    job,
    guest,
  };
}

export {DutyData, RouletteResultInput, buildRouletteCard};
