import {UpstreamError} from '../errors';
import {Duty, DutyData, DutyGroup, Finder, PvpType, Roulette} from './duty';

const XIVAPI_URL = 'https://v2.xivapi.com/api';

// The minimal HTTP GET the client needs; the Worker's global fetch fits it.
type HttpGet = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

interface SheetPage {
  version: string;
  rows: {row_id: number; fields: Record<string, unknown>}[];
}

// Duty Finder roulette flags on a duty, in the order the game lists them.
const ROULETTE_FLAGS = [
  'LevelingRoulette',
  'HighLevelRoulette',
  'MSQRoulette',
  'GuildHestRoulette',
  'ExpertRoulette',
  'TrialRoulette',
  'DailyFrontlineChallenge',
  'LevelCapRoulette',
  'MentorRoulette',
  'AllianceRoulette',
  'FeastTeamRoulette',
  'NormalRaidRoulette',
  'CrystallineConflictCasualRoulette',
  'CrystallineConflictRankedRoulette',
];

// Linked rows are read as raw ids (@as(raw)) and resolved from the small
// ContentType and ExVersion sheets: expanding them inline makes the
// ContentFinderCondition download several times larger.
const DUTY_FIELDS = [
  'Name',
  'ContentType@as(raw)',
  'RequiredExVersion@as(raw)',
  'ContentMemberType@as(raw)',
  'RaidFinderParam@as(raw)',
  'ClassJobLevelRequired',
  'ClassJobLevelSync',
  'ItemLevelRequired',
  'ItemLevelSync',
  'AllowReplacement',
  'AllowUndersized',
  'AllowMinimumIL',
  'AllowExplorerMode',
  'DutyRecorderAllowed',
  'HighEndDuty',
  'PvP',
  'IsInDutyFinder',
  'SortKey',
  ...ROULETTE_FLAGS,
];

const ROULETTE_FIELDS = [
  'Name',
  'Category',
  'DutyType',
  'Description',
  'RequiredLevel',
  'SyncedFromLevel',
  'ItemLevelRequired',
  'ItemLevelSync',
  'AllowReplacement',
  'TimeLimit',
  'RequiredExVersion@as(raw)',
  'IsInDutyFinder',
  'IsPvP',
  'IsGoldSaucer',
  'SortKey',
];

// The game's IsInDutyFinder flag is unreliable (Ultimates and the current
// Savage tier are false), so duties are picked by content type instead. For
// the "flagged only" types the unflagged rows are duplicates, tutorials or
// race stages.
const KEEP_TYPES = new Set([
  'Dungeons',
  'Guildhests',
  'Trials',
  'Raids',
  'Ultimate Raids',
  'Chaotic Alliance Raid',
  'Deep Dungeons',
  'V&C Dungeon Finder',
  'Treasure Hunt',
  'Eureka',
  'Save the Queen',
  'Occult Crescent',
]);
const FLAGGED_ONLY_TYPES = new Set(['PvP', 'Gold Saucer']);

const GROUP_ORDER = [
  'Dungeons',
  'Guildhests',
  'Trials — Normal',
  'Trials — Extreme',
  'Trials — Unreal',
  'Raids — Normal',
  'Raids — Savage',
  'Raids — Ultimate',
  'Alliance Raids',
  'Alliance Raids — Chaotic',
  'Variant & Criterion Dungeons',
  'Deep Dungeons',
  'Field Operations',
  'Treasure Hunt',
  'PvP',
  'Gold Saucer',
];

// Alliance raids share a party-size type, found from a known alliance raid.
// Rival Wings maps likewise, from a known Rival Wings map.
const KNOWN_ALLIANCE_RAID = 'the Labyrinth of the Ancients';
const KNOWN_RIVAL_WINGS = 'Hidden Gorge';

interface RawDuty extends Duty {
  contentType: string;
  memberType: number;
}

// Reads the FFXIV duty and roulette lists from XIVAPI (v2), which serves the
// game's own data sheets.
class XivApiClient {
  constructor(
    private readonly httpGet: HttpGet,
    private readonly baseUrl = XIVAPI_URL
  ) {}

  async fetchDutyData(): Promise<DutyData> {
    const [contentTypes, expansions, dutyRows, rouletteRows] =
      await Promise.all([
        this.readNames('ContentType'),
        this.readNames('ExVersion'),
        this.readSheet('ContentFinderCondition', DUTY_FIELDS),
        this.readSheet('ContentRoulette', ROULETTE_FIELDS),
      ]);

    const duties = dutyRows.rows
      .filter(({fields: f}) => f.Name)
      .map(({row_id, fields: f}) => toDuty(row_id, f, contentTypes, expansions))
      .filter(
        d =>
          KEEP_TYPES.has(d.contentType) ||
          (FLAGGED_ONLY_TYPES.has(d.contentType) && d.finder === 'Duty Finder')
      );

    const roulettes = rouletteRows.rows
      .filter(({fields: f}) => f.Name && f.IsInDutyFinder)
      .map(({row_id, fields: f}) => toRoulette(row_id, f, expansions))
      .sort((a, b) => a.sortKey - b.sortKey);

    return {
      dataVersion: dutyRows.version,
      groups: groupDuties(duties),
      roulettes,
    };
  }

  // Reads a whole sheet, following the `after` pagination.
  private async readSheet(sheet: string, fields: string[]) {
    const rows: SheetPage['rows'] = [];
    let version = '';
    let after: number | undefined;

    for (;;) {
      let url = `${
        this.baseUrl
      }/sheet/${sheet}?limit=500&fields=${encodeURIComponent(
        fields.join(',')
      )}`;
      if (after !== undefined) {
        url += `&after=${after}`;
      }

      const response = await this.httpGet(url);
      if (!response.ok) {
        throw new UpstreamError(
          `XIVAPI ${sheet} returned HTTP ${response.status}`
        );
      }

      const page = (await response.json()) as SheetPage;
      if (page.rows.length === 0) {
        return {version, rows};
      }

      version = page.version;
      rows.push(...page.rows);
      after = page.rows[page.rows.length - 1].row_id;
    }
  }

  private async readNames(sheet: string) {
    const {rows} = await this.readSheet(sheet, ['Name']);
    return new Map(rows.map(row => [row.row_id, String(row.fields.Name)]));
  }
}

function toDuty(
  id: number,
  f: Record<string, unknown>,
  contentTypes: Map<number, string>,
  expansions: Map<number, string>
): RawDuty {
  let finder: Finder = '';
  if (f['RaidFinderParam@as(raw)']) {
    finder = 'Raid Finder';
  } else if (f.IsInDutyFinder) {
    finder = 'Duty Finder';
  }

  return {
    id,
    name: String(f.Name),
    finder,
    contentType: contentTypes.get(Number(f['ContentType@as(raw)'])) ?? '',
    memberType: Number(f['ContentMemberType@as(raw)']),
    expansion: expansions.get(Number(f['RequiredExVersion@as(raw)'])) ?? '',
    level: Number(f.ClassJobLevelRequired),
    levelSync: Number(f.ClassJobLevelSync),
    itemLevel: Number(f.ItemLevelRequired),
    itemLevelSync: Number(f.ItemLevelSync),
    joinPartyInProgress: Boolean(f.AllowReplacement),
    unrestrictedParty: Boolean(f.AllowUndersized),
    minimumIL: Boolean(f.AllowMinimumIL),
    explorerMode: Boolean(f.AllowExplorerMode),
    dutyRecorder: Boolean(f.DutyRecorderAllowed),
    highEnd: Boolean(f.HighEndDuty),
    pvp: Boolean(f.PvP),
    pvpType: '',
    roulettes: ROULETTE_FLAGS.filter(flag => f[flag]),
    sortKey: Number(f.SortKey),
  };
}

function toRoulette(
  id: number,
  f: Record<string, unknown>,
  expansions: Map<number, string>
): Roulette {
  return {
    id,
    name: String(f.Name),
    category: String(f.Category),
    dutyType: String(f.DutyType).replace(/^Duty Type:\s*/, ''),
    expansion: expansions.get(Number(f['RequiredExVersion@as(raw)'])) ?? '',
    level: Number(f.RequiredLevel),
    syncedFromLevel: Number(f.SyncedFromLevel),
    itemLevel: Number(f.ItemLevelRequired),
    itemLevelSync: Number(f.ItemLevelSync),
    joinPartyInProgress: Boolean(f.AllowReplacement),
    timeLimitMinutes: Number(f.TimeLimit),
    pvp: Boolean(f.IsPvP),
    goldSaucer: Boolean(f.IsGoldSaucer),
    description: String(f.Description).trim(),
    sortKey: Number(f.SortKey),
  };
}

// The HighEndDuty flag isn't set on Extreme trials, so difficulty comes from
// the name.
function groupOf(d: RawDuty, allianceMemberType: number | undefined) {
  const name = d.name.toLowerCase();
  switch (d.contentType) {
    case 'Trials':
      if (name.includes('(unreal)')) return 'Trials — Unreal';
      if (name.includes('(extreme)') || name.includes("minstrel's ballad")) {
        return 'Trials — Extreme';
      }
      return 'Trials — Normal';
    case 'Raids':
      if (d.memberType === allianceMemberType) return 'Alliance Raids';
      return name.includes('(savage)') ? 'Raids — Savage' : 'Raids — Normal';
    case 'Ultimate Raids':
      return 'Raids — Ultimate';
    case 'Chaotic Alliance Raid':
      return 'Alliance Raids — Chaotic';
    case 'V&C Dungeon Finder':
      return 'Variant & Criterion Dungeons';
    case 'Eureka':
    case 'Save the Queen':
    case 'Occult Crescent':
      return 'Field Operations';
    default:
      return d.contentType;
  }
}

function pvpTypeOf(
  d: RawDuty,
  rivalWingsMemberType: number | undefined
): PvpType {
  if (d.contentType !== 'PvP') return '';
  if (d.roulettes.includes('DailyFrontlineChallenge')) return 'Frontline';
  if (d.name.startsWith('Crystalline Conflict')) return 'Crystalline Conflict';
  if (d.memberType === rivalWingsMemberType) return 'Rival Wings';
  return '';
}

function groupDuties(duties: RawDuty[]): DutyGroup[] {
  const memberTypeOf = (name: string) =>
    duties.find(d => d.name === name)?.memberType;
  const allianceMemberType = memberTypeOf(KNOWN_ALLIANCE_RAID);
  const rivalWingsMemberType = memberTypeOf(KNOWN_RIVAL_WINGS);

  const groups = new Map<string, Duty[]>();
  const seen = new Set<string>();

  for (const raw of duties) {
    const group = groupOf(raw, allianceMemberType);
    // Some duties appear more than once in the sheet under the same name.
    if (seen.has(`${group}/${raw.name}`)) continue;
    seen.add(`${group}/${raw.name}`);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {contentType, memberType, ...duty} = raw;
    duty.pvpType = pvpTypeOf(raw, rivalWingsMemberType);
    groups.set(group, [...(groups.get(group) ?? []), duty]);
  }

  const rank = (name: string) => {
    const index = GROUP_ORDER.indexOf(name);
    return index < 0 ? GROUP_ORDER.length : index;
  };

  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([name, list], order) => ({
      name,
      order,
      duties: list.sort(
        (a, b) =>
          a.level - b.level ||
          a.itemLevel - b.itemLevel ||
          a.sortKey - b.sortKey
      ),
    }));
}

export {XivApiClient, HttpGet};
