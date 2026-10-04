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
      ...extra,
    },
  };
}

function defaultSheets(): Record<string, Row[]> {
  return {
    ContentType: [
      {row_id: 2, fields: {Name: 'Dungeons'}},
      {row_id: 4, fields: {Name: 'Trials'}},
      {row_id: 5, fields: {Name: 'Raids'}},
      {row_id: 6, fields: {Name: 'PvP'}},
      {row_id: 7, fields: {Name: 'Quest Battles'}},
      {row_id: 9, fields: {Name: 'Treasure Hunt'}},
      {row_id: 28, fields: {Name: 'Ultimate Raids'}},
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
        },
      },
      {row_id: 2, fields: {Name: 'Hidden roulette', IsInDutyFinder: false}},
    ],
  };
}

// Serves /sheet/<name>?after=<row id> from in-memory rows, like XIVAPI v2.
class FakeXivApi {
  sheets = defaultSheets();
  failing = false;
  requests: string[] = [];

  reset() {
    this.sheets = defaultSheets();
    this.failing = false;
    this.requests = [];
  }

  readonly httpGet: HttpGet = async url => {
    this.requests.push(url);

    const sheet = /\/sheet\/(\w+)/.exec(url)?.[1] ?? '';
    const after = Number(/[?&]after=(\d+)/.exec(url)?.[1] ?? -1);
    const rows = this.sheets[sheet];

    if (this.failing || !rows) {
      return {ok: false, status: 503, json: async () => ({})};
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
    };
  };
}

export {FakeXivApi, duty};
