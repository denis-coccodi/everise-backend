import {clock} from './app';

// An entry as xivpf sends it: a Light (Odin) high-end listing by default.
function xivpfEntry(
  changes: {
    id?: number;
    world?: {id: number; name: string};
    category?: string;
    duty?: string | null;
    dutyType?: string;
    updatedSecondsAgo?: number;
    secondsRemaining?: number;
    searchArea?: {world: boolean; one_player_per_job: boolean};
    slotCount?: number;
    slots?: string[][];
    filled?: (string | null)[];
  } = {},
) {
  const world = changes.world ?? {id: 66, name: 'Odin'};
  const duty =
    changes.duty === undefined
      ? 'The Unending Coil of Bahamut (Ultimate)'
      : changes.duty;
  return {
    created_at: new Date(clock.now!.getTime() - 600_000).toISOString(),
    updated_at: new Date(
      clock.now!.getTime() - (changes.updatedSecondsAgo ?? 60) * 1000,
    ).toISOString(),
    time_left: 3000,
    listing: {
      id: changes.id ?? 1,
      recruiter: 'Tataru Taru',
      description: {en: 'Prog from P3, know the mechanics', ja: 'P3'},
      created_world: world,
      home_world: {id: 67, name: 'Shiva'},
      current_world: world,
      category: changes.category ?? 'HighEndDuty',
      duty_info: duty
        ? {
            name: {en: duty},
            high_end: true,
            content_kind_id: 28,
            content_kind: 'UltimateRaids',
          }
        : null,
      duty_type: changes.dutyType ?? 'Normal',
      beginners_welcome: false,
      seconds_remaining: changes.secondsRemaining ?? 3600,
      min_item_level: 0,
      num_parties: 1,
      slot_count: changes.slotCount ?? 3,
      last_server_restart: 1789630212,
      objective: {duty_completion: false, practice: true, loot: false},
      conditions: {
        duty_complete: false,
        duty_incomplete: false,
        duty_complete_reward_unclaimed: false,
      },
      duty_finder_settings: {
        undersized_party: false,
        minimum_item_level: false,
        silence_echo: false,
      },
      loot_rules: {greed_only: false, lootmaster: true},
      search_area: {
        data_centre: !changes.searchArea?.world,
        private: false,
        alliance_raid: false,
        ...(changes.searchArea ?? {world: false, one_player_per_job: true}),
      },
      slots: changes.slots ?? [
        ['PLD'],
        ['PLD', 'WAR', 'DRK', 'GNB'],
        ['WHM', 'SCH', 'AST', 'SGE', 'BLM'],
      ],
      slots_filled: changes.filled ?? ['PLD', null, null],
    },
  };
}

export {xivpfEntry};
