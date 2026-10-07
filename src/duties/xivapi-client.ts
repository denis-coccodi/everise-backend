import {UpstreamError} from '../errors';
import {DutyData, ImageRef} from './duty';
import {
  ContentType,
  ROULETTE_FLAGS,
  groupDuties,
  iconPath,
  iconsByName,
  imageId,
  imagesOf,
  isCombatJob,
  toDuty,
  toJob,
  toRoulette,
} from './xivapi-records';

const XIVAPI_URL = 'https://v2.xivapi.com/api';

// The minimal HTTP GET the client needs; the Worker's global fetch fits it.
type HttpGet = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

interface SheetPage {
  version: string;
  rows: {row_id: number; fields: Record<string, unknown>}[];
}

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
  'Image@as(raw)',
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
  'Image@as(raw)',
];

const CLASS_JOB_FIELDS = [
  'Name',
  'Abbreviation',
  'Role',
  'JobIndex',
  'IsLimitedJob',
  'StartingLevel',
  'ClassJobCategory@as(raw)',
  'UIPriority',
];

// The ContentType row of duty roulettes, whose icon the roulette type uses.
const ROULETTE_CONTENT_TYPE = 'Duty Roulette';

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

// Reads the FFXIV duty and roulette lists from XIVAPI (v2), which serves the
// game's own data sheets.
class XivApiClient {
  constructor(
    private readonly httpGet: HttpGet,
    private readonly baseUrl = XIVAPI_URL,
  ) {}

  async fetchDutyData(): Promise<DutyData> {
    const [contentTypes, expansions, dutyRows, rouletteRows, jobRows] =
      await Promise.all([
        this.readContentTypes(),
        this.readNames('ExVersion'),
        this.readSheet('ContentFinderCondition', DUTY_FIELDS),
        this.readSheet('ContentRoulette', ROULETTE_FIELDS),
        this.readSheet('ClassJob', CLASS_JOB_FIELDS),
      ]);
    const typeNames = new Map(
      [...contentTypes].map(([id, type]) => [id, type.name]),
    );
    const typeIcons = iconsByName(contentTypes);

    const duties = dutyRows.rows
      .filter(({fields: f}) => f.Name)
      .map(({row_id, fields: f}) => toDuty(row_id, f, typeNames, expansions))
      .filter(
        d =>
          KEEP_TYPES.has(d.contentType) ||
          (FLAGGED_ONLY_TYPES.has(d.contentType) && d.finder === 'Duty Finder'),
      );

    const roulettes = rouletteRows.rows
      .filter(({fields: f}) => f.Name && f.IsInDutyFinder)
      .map(({row_id, fields: f}) => toRoulette(row_id, f, expansions))
      .sort((a, b) => a.sortKey - b.sortKey);

    const groups = groupDuties(duties, typeIcons);
    const rouletteIcon = typeIcons.get(ROULETTE_CONTENT_TYPE) ?? null;
    const jobs = jobRows.rows
      .filter(({fields: f}) => isCombatJob(f))
      .sort((a, b) => Number(a.fields.UIPriority) - Number(b.fields.UIPriority))
      .map(({row_id, fields: f}) => toJob(row_id, f));

    return {
      dataVersion: dutyRows.version,
      groups,
      roulettes,
      rouletteIcon,
      jobs,
      images: imagesOf(groups, roulettes, rouletteIcon, jobs),
    };
  }

  // Downloads one game image, converted by XIVAPI. Null when XIVAPI has no
  // such image.
  async fetchImage(image: ImageRef): Promise<Uint8Array | null> {
    const path = encodeURIComponent(iconPath(image.id));
    const response = await this.httpGet(
      `${this.baseUrl}/asset?path=${path}&format=${image.format}`,
    );

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new UpstreamError(
        `XIVAPI image ${image.id} returned HTTP ${response.status}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
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
        fields.join(','),
      )}`;
      if (after !== undefined) {
        url += `&after=${after}`;
      }

      const response = await this.httpGet(url);
      if (!response.ok) {
        throw new UpstreamError(
          `XIVAPI ${sheet} returned HTTP ${response.status}`,
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

  private async readContentTypes() {
    const {rows} = await this.readSheet('ContentType', [
      'Name',
      'Icon@as(raw)',
    ]);
    return new Map<number, ContentType>(
      rows.map(({row_id, fields: f}) => [
        row_id,
        {name: String(f.Name), icon: imageId(f['Icon@as(raw)'])},
      ]),
    );
  }

  private async readNames(sheet: string) {
    const {rows} = await this.readSheet(sheet, ['Name']);
    return new Map(rows.map(row => [row.row_id, String(row.fields.Name)]));
  }
}

export {XivApiClient, HttpGet};
