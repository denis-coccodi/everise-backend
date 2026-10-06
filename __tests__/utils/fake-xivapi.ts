import {HttpGet} from '../../src/duties';

type Row = {row_id: number; fields: Record<string, unknown>};

// Pages are kept tiny so the client's pagination is exercised.
const PAGE_SIZE = 2;

function duty(
  row_id: number,
  name: string,
  contentType: number,
  extra: Record<string, unknown> = {}
): Row {
  return {
    row_id,
    fields: {
      Name: name,
      'ContentType@as(raw)': contentType,
      'RequiredExVersion@as(raw)': 0,
      'ContentMemberType@as(raw)': 3,
      'RaidFinderParam@as(raw)': 0,
      ClassJobLevelRequired: 50,
      ClassJobLevelSync: 50,
      ItemLevelRequired: 0,
      ItemLevelSync: 0,
      AllowReplacement: true,
      AllowUndersized: true,
      AllowMinimumIL: true,
      AllowExplorerMode: false,
      DutyRecorderAllowed: false,
      HighEndDuty: false,
      PvP: false,
      IsInDutyFinder: true,
      SortKey: row_id,
      // A banner per duty, numbered after the row.
      'Image@as(raw)': 112000 + row_id,
      ...extra,
    },
  };
}

function defaultSheets(): Record<string, Row[]> {
  return {
    ContentType: [
      {row_id: 1, fields: {Name: 'Duty Roulette', 'Icon@as(raw)': 61807}},
      {row_id: 2, fields: {Name: 'Dungeons', 'Icon@as(raw)': 61801}},
      {row_id: 4, fields: {Name: 'Trials', 'Icon@as(raw)': 61804}},
      {row_id: 5, fields: {Name: 'Raids', 'Icon@as(raw)': 61802}},
      {row_id: 6, fields: {Name: 'PvP', 'Icon@as(raw)': 61806}},
      {row_id: 7, fields: {Name: 'Quest Battles', 'Icon@as(raw)': 61805}},
      {row_id: 9, fields: {Name: 'Treasure Hunt', 'Icon@as(raw)': 0}},
      {row_id: 28, fields: {Name: 'Ultimate Raids', 'Icon@as(raw)': 61832}},
    ],
    ExVersion: [
      {row_id: 0, fields: {Name: 'A Realm Reborn'}},
      {row_id: 5, fields: {Name: 'Dawntrail'}},
    ],
    ContentFinderCondition: [
      {row_id: 0, fields: {Name: ''}},
      duty(1, 'Sastasha', 2, {
        ClassJobLevelRequired: 15,
        ClassJobLevelSync: 20,
        AllowExplorerMode: true,
        LevelingRoulette: true,
      }),
      duty(2, 'the Labyrinth of the Ancients', 5, {
        'ContentMemberType@as(raw)': 4,
        AllianceRoulette: true,
      }),
      duty(3, 'the Navel (Extreme)', 4),
      duty(4, 'Dancing Mad (Ultimate)', 28, {
        'RequiredExVersion@as(raw)': 5,
        'RaidFinderParam@as(raw)': 3,
        IsInDutyFinder: false,
        AllowUndersized: false,
        ClassJobLevelRequired: 100,
        ItemLevelRequired: 760,
      }),
      duty(5, 'a Spectacle for the Ages', 7),
      duty(6, 'Sastasha', 2),
      // A treasure dungeon: anyone can enter (level 1) but it syncs to 90, and
      // the game marks Duty Finder settings it can't use (it isn't queued).
      duty(7, 'the Excitatron 6000', 9, {
        IsInDutyFinder: false,
        ClassJobLevelRequired: 1,
        ClassJobLevelSync: 90,
        AllowExplorerMode: true,
      }),
      // PvP: two Frontline maps, a Rival Wings map, a Crystalline Conflict
      // custom match, and a ranked-match row left out for not being flagged.
      duty(130, 'Seal Rock (Seize)', 6, {
        'ContentMemberType@as(raw)': 7,
        PvP: true,
        DailyFrontlineChallenge: true,
      }),
      duty(127, 'the Borderland Ruins (Secure)', 6, {
        'ContentMemberType@as(raw)': 7,
        PvP: true,
        DailyFrontlineChallenge: true,
      }),
      duty(599, 'Hidden Gorge', 6, {
        'ContentMemberType@as(raw)': 18,
        PvP: true,
      }),
      duty(835, 'the Palaistra', 6, {
        'ContentMemberType@as(raw)': 29,
        PvP: true,
        IsInDutyFinder: false,
      }),
      duty(862, 'Crystalline Conflict (Custom Match - The Palaistra)', 6, {
        'ContentMemberType@as(raw)': 30,
        PvP: true,
      }),
    ],
    ContentRoulette: [
      {
        row_id: 1,
        fields: {
          Name: 'Duty Roulette: Leveling',
          Category: 'Leveling',
          DutyType: 'Duty Type: Light Party Dungeons & Trials',
          Description: 'A dungeon or trial will be selected at random.\n',
          RequiredLevel: 16,
          SyncedFromLevel: 16,
          ItemLevelRequired: 0,
          ItemLevelSync: 0,
          AllowReplacement: true,
          TimeLimit: 90,
          'RequiredExVersion@as(raw)': 0,
          IsInDutyFinder: true,
          IsPvP: false,
          IsGoldSaucer: false,
          SortKey: 4,
          'Image@as(raw)': 112034,
        },
      },
      {row_id: 2, fields: {Name: 'Hidden roulette', IsInDutyFinder: false}},
      // The Frontline daily challenge, whose map the rotation knows.
      {
        row_id: 3,
        fields: {
          Name: 'Frontline (Daily Challenge)',
          Category: 'PvP',
          DutyType: 'Duty Type: PvP',
          Description: "Today's Frontline map.\n",
          RequiredLevel: 30,
          SyncedFromLevel: 0,
          ItemLevelRequired: 0,
          ItemLevelSync: 0,
          AllowReplacement: true,
          TimeLimit: 20,
          'RequiredExVersion@as(raw)': 0,
          IsInDutyFinder: true,
          IsPvP: true,
          IsGoldSaucer: false,
          SortKey: 20,
          'Image@as(raw)': 0,
        },
      },
    ],
    // A class, a crafter, jobs of each discipline listed out of order, and a
    // limited job.
    ClassJob: [
      job(1, 'gladiator', 'GLA', {JobIndex: 0, Role: 1, UIPriority: 2}),
      job(8, 'carpenter', 'CRP', {
        JobIndex: 0,
        Role: 0,
        'ClassJobCategory@as(raw)': 33,
        UIPriority: 101,
      }),
      job(25, 'black mage', 'BLM', {
        Role: 3,
        'ClassJobCategory@as(raw)': 31,
        UIPriority: 41,
      }),
      job(19, 'paladin', 'PLD', {Role: 1, UIPriority: 1}),
      job(41, 'viper', 'VPR', {Role: 2, StartingLevel: 80, UIPriority: 29}),
      job(23, 'bard', 'BRD', {Role: 3, UIPriority: 31}),
      job(24, 'white mage', 'WHM', {
        Role: 4,
        'ClassJobCategory@as(raw)': 31,
        UIPriority: 11,
      }),
      job(36, 'blue mage', 'BLU', {
        Role: 3,
        'ClassJobCategory@as(raw)': 31,
        IsLimitedJob: true,
        UIPriority: 47,
      }),
    ],
  };
}

function job(
  row_id: number,
  name: string,
  abbreviation: string,
  extra: Record<string, unknown>
): Row {
  return {
    row_id,
    fields: {
      Name: name,
      Abbreviation: abbreviation,
      JobIndex: row_id,
      IsLimitedJob: false,
      StartingLevel: 1,
      'ClassJobCategory@as(raw)': 30,
      ...extra,
    },
  };
}

// The bytes the fake serves for an image: its path and format as text.
function imageBytes(path: string, format: string) {
  return new Uint8Array(Buffer.from(`${path} as ${format}`));
}

// Serves /sheet/<name>?after=<row id> from in-memory rows, and
// /asset?path=<game file>&format=<png|jpg> images, like XIVAPI v2.
class FakeXivApi {
  sheets = defaultSheets();
  failing = false;
  // Image ids XIVAPI answers 404 for.
  missingImages = new Set<number>();
  // Image ids XIVAPI answers 503 for.
  failingImages = new Set<number>();
  requests: string[] = [];

  reset() {
    this.sheets = defaultSheets();
    this.failing = false;
    this.missingImages = new Set();
    this.failingImages = new Set();
    this.requests = [];
  }

  readonly httpGet: HttpGet = async url => {
    this.requests.push(url);

    const asset = /\/asset\?path=([^&]+)&format=(\w+)/.exec(url);
    if (asset) {
      const path = decodeURIComponent(asset[1]);
      const id = Number(/(\d+)_hr1\.tex$/.exec(path)?.[1]);
      const status = this.failing || this.failingImages.has(id) ? 503 : 200;
      if (this.missingImages.has(id) || status !== 200) {
        const missing = this.missingImages.has(id);
        return {
          ok: false,
          status: missing ? 404 : status,
          json: async () => ({}),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      }
      const bytes = imageBytes(path, asset[2]);
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        arrayBuffer: async () => bytes.slice().buffer,
      };
    }

    const sheet = /\/sheet\/(\w+)/.exec(url)?.[1] ?? '';
    const after = Number(/[?&]after=(\d+)/.exec(url)?.[1] ?? -1);
    const rows = this.sheets[sheet];

    if (this.failing || !rows) {
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }

    // Like XIVAPI, rows come in row id order.
    const page = [...rows]
      .sort((a, b) => a.row_id - b.row_id)
      .filter(row => row.row_id > after)
      .slice(0, PAGE_SIZE);
    return {
      ok: true,
      status: 200,
      json: async () => ({version: 'test-version', rows: page}),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
}

export {FakeXivApi, duty, imageBytes};
