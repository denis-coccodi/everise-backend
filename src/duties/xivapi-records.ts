import {
  Duty,
  DutyGroup,
  Finder,
  ImageRef,
  Job,
  PvpType,
  Role,
  Roulette,
} from './duty';

// XIVAPI's records read as duties, roulettes, jobs and their images.

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

// ClassJobCategory rows of the Disciples of War and Magic.
const DISCIPLE_OF_WAR = 30;
const DISCIPLE_OF_MAGIC = 31;

// The ClassJob sheet's Role numbers. Ranged jobs (3) are split by discipline.
const ROLES: Record<number, Role> = {1: 'Tank', 2: 'Melee DPS', 4: 'Healer'};

// Each job's framed, role-coloured icon is this id plus the job's row id.
const JOB_ICON_BASE = 62100;

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

interface ContentType {
  name: string;
  icon: number | null;
}

function toDuty(
  id: number,
  f: Record<string, unknown>,
  contentTypes: Map<number, string>,
  expansions: Map<number, string>,
): RawDuty {
  let finder: Finder = '';
  if (f['RaidFinderParam@as(raw)']) {
    finder = 'Raid Finder';
  } else if (f.IsInDutyFinder) {
    finder = 'Duty Finder';
  }

  // Duty Finder settings only apply to duties queued through a finder. The
  // game sets them on others too (treasure dungeons, field operations,
  // Variant dungeons), where they mean nothing.
  const queued = finder !== '';

  // Some duties anyone can enter (level 1) but that sync to a level, like
  // treasure dungeons: their real level is the sync level.
  const levelRequired = Number(f.ClassJobLevelRequired);
  const levelSync = Number(f.ClassJobLevelSync);
  const level = levelRequired <= 1 && levelSync > 1 ? levelSync : levelRequired;

  return {
    id,
    name: String(f.Name),
    finder,
    contentType: contentTypes.get(Number(f['ContentType@as(raw)'])) ?? '',
    memberType: Number(f['ContentMemberType@as(raw)']),
    expansion: expansions.get(Number(f['RequiredExVersion@as(raw)'])) ?? '',
    level,
    levelSync,
    itemLevel: Number(f.ItemLevelRequired),
    itemLevelSync: Number(f.ItemLevelSync),
    joinPartyInProgress: queued && Boolean(f.AllowReplacement),
    unrestrictedParty: queued && Boolean(f.AllowUndersized),
    minimumIL: queued && Boolean(f.AllowMinimumIL),
    explorerMode: queued && Boolean(f.AllowExplorerMode),
    dutyRecorder: Boolean(f.DutyRecorderAllowed),
    highEnd: Boolean(f.HighEndDuty),
    pvp: Boolean(f.PvP),
    pvpType: '',
    roulettes: ROULETTE_FLAGS.filter(flag => f[flag]),
    sortKey: Number(f.SortKey),
    image: imageId(f['Image@as(raw)']),
  };
}

function toRoulette(
  id: number,
  f: Record<string, unknown>,
  expansions: Map<number, string>,
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
    image: imageId(f['Image@as(raw)']),
  };
}

// Jobs only: classes have no JobIndex, and crafters and gatherers aren't
// Disciples of War or Magic.
function isCombatJob(f: Record<string, unknown>) {
  const category = Number(f['ClassJobCategory@as(raw)']);
  return (
    Number(f.JobIndex) > 0 &&
    (category === DISCIPLE_OF_WAR || category === DISCIPLE_OF_MAGIC)
  );
}

function toJob(id: number, f: Record<string, unknown>): Job {
  const magic = Number(f['ClassJobCategory@as(raw)']) === DISCIPLE_OF_MAGIC;
  const role =
    ROLES[Number(f.Role)] ??
    (magic ? 'Magical Ranged DPS' : 'Physical Ranged DPS');

  return {
    id,
    // The sheet's names are lower case ("white mage").
    name: String(f.Name).replace(/\b\w/g, c => c.toUpperCase()),
    abbreviation: String(f.Abbreviation),
    role,
    startingLevel: Number(f.StartingLevel),
    limited: Boolean(f.IsLimitedJob),
    icon: JOB_ICON_BASE + id,
  };
}

// Icon id 0 means no image.
function imageId(value: unknown) {
  const id = Number(value);
  return id > 0 ? id : null;
}

// The game file of an icon, in its high-resolution version: icon 112005 is
// ui/icon/112000/112005_hr1.tex.
function iconPath(id: number) {
  const pad = (n: number) => String(n).padStart(6, '0');
  return `ui/icon/${pad(Math.floor(id / 1000) * 1000)}/${pad(id)}_hr1.tex`;
}

// Content type names to their icons; the first row wins for repeated names.
function iconsByName(contentTypes: Map<number, ContentType>) {
  const icons = new Map<string, number>();
  for (const {name, icon} of contentTypes.values()) {
    if (icon !== null && !icons.has(name)) icons.set(name, icon);
  }
  return icons;
}

// Every image the data refers to, once. Icons are kept as PNG for their
// transparency; banners as JPEG, a tenth of the size.
function imagesOf(
  groups: DutyGroup[],
  roulettes: Roulette[],
  rouletteIcon: number | null,
  jobs: Job[],
): ImageRef[] {
  const images = new Map<number, ImageRef>();
  const add = (id: number | null, format: ImageRef['format']) => {
    if (id !== null && !images.has(id)) images.set(id, {id, format});
  };

  jobs.forEach(job => add(job.icon, 'png'));
  groups.forEach(group => add(group.icon, 'png'));
  add(rouletteIcon, 'png');
  roulettes.forEach(roulette => add(roulette.image, 'jpg'));
  groups.forEach(group => group.duties.forEach(duty => add(duty.image, 'jpg')));

  return [...images.values()];
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
  rivalWingsMemberType: number | undefined,
): PvpType {
  if (d.contentType !== 'PvP') return '';
  if (d.roulettes.includes('DailyFrontlineChallenge')) return 'Frontline';
  if (d.name.startsWith('Crystalline Conflict')) return 'Crystalline Conflict';
  if (d.memberType === rivalWingsMemberType) return 'Rival Wings';
  return '';
}

function groupDuties(
  duties: RawDuty[],
  typeIcons: Map<string, number>,
): DutyGroup[] {
  const memberTypeOf = (name: string) =>
    duties.find(d => d.name === name)?.memberType;
  const allianceMemberType = memberTypeOf(KNOWN_ALLIANCE_RAID);
  const rivalWingsMemberType = memberTypeOf(KNOWN_RIVAL_WINGS);

  const groups = new Map<string, Duty[]>();
  // Each group takes the icon of the content type its duties come from.
  const icons = new Map<string, number | null>();
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
    if (!icons.has(group)) {
      icons.set(group, typeIcons.get(raw.contentType) ?? null);
    }
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
      icon: icons.get(name) ?? null,
      duties: list.sort(
        (a, b) =>
          a.level - b.level ||
          a.itemLevel - b.itemLevel ||
          a.sortKey - b.sortKey,
      ),
    }));
}

export {
  ROULETTE_FLAGS,
  DISCIPLE_OF_WAR,
  DISCIPLE_OF_MAGIC,
  ROLES,
  JOB_ICON_BASE,
  GROUP_ORDER,
  KNOWN_ALLIANCE_RAID,
  KNOWN_RIVAL_WINGS,
  RawDuty,
  ContentType,
  toDuty,
  toRoulette,
  isCombatJob,
  toJob,
  imageId,
  iconPath,
  iconsByName,
  imagesOf,
  groupOf,
  pvpTypeOf,
  groupDuties,
};
