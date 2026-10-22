import {KNOWN_ALLIANCE_RAID, groupOf} from './xivapi-records';
import {FightKind} from './duty-model';
import {RawDuty} from './xivapi-dto';

const FIGHT_GROUPS: Record<string, FightKind> = {
  'Trials — Extreme': 'extreme',
  'Raids — Savage': 'savage',
  'Raids — Ultimate': 'ultimate',
};

// The Extreme trials and the Savage and Ultimate raids, by the id of the
// game territory they're fought in: logs (FFLogs' gameZone) name a fight's
// territory, never its duty. Sorted as the duty groups are, from the duty's
// name in the game data (so "The Minstrel's Ballad: ..." is Extreme).
function fightTerritories(duties: RawDuty[]): Record<string, FightKind> {
  const allianceMemberType = duties.find(
    d => d.name === KNOWN_ALLIANCE_RAID,
  )?.memberType;
  const fights: Record<string, FightKind> = {};
  for (const duty of duties) {
    const kind = FIGHT_GROUPS[groupOf(duty, allianceMemberType)];
    if (kind && duty.territory) fights[duty.territory] = kind;
  }
  return fights;
}

export {fightTerritories};
