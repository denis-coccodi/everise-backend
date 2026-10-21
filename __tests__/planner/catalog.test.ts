import 'jest-extended';
import request from 'supertest';
import {ENTRIES} from '../../src/planner/catalog/effect-table';
import {app, clearDb, xivApi} from '../utils';

const KEY = process.env.DUTIES_REFRESH_KEY!;
const refresh = (key: string | null = KEY) => {
  const req = request(app).post('/api/planner/catalog/refresh');
  return key === null ? req.send() : req.set('X-Refresh-Key', key).send();
};

// An Action row as XIVAPI sends it with the catalog's fields.
function action(
  id: number,
  name: string,
  jobs: string,
  fields: Record<string, unknown> = {},
) {
  return {
    row_id: id,
    fields: {
      Name: name,
      'Icon@as(raw)': 800 + (id % 100),
      ClassJobCategory: {row_id: 1, fields: {Name: jobs}},
      ClassJobLevel: 50,
      Cast100ms: 0,
      Recast100ms: 600,
      MaxCharges: 0,
      CooldownGroup: 10,
      AdditionalCooldownGroup: 0,
      Range: 0,
      EffectRange: 0,
      IsPlayerAction: true,
      ...fields,
    },
  };
}
const tooltip = (id: number, text: string) => ({
  row_id: id,
  fields: {Description: text},
});

beforeEach(async () => {
  await clearDb();
  xivApi.reset();
  xivApi.sheets.Action = [
    action(7531, 'Rampart', 'GLA MRD PLD WAR DRK GNB', {
      ClassJobLevel: 8,
      Recast100ms: 900,
    }),
    action(185, 'Adloquium', 'SCH', {
      Cast100ms: 20,
      Recast100ms: 25,
      CooldownGroup: 58,
      Range: 30,
    }),
    action(188, 'Sacred Soil', 'SCH', {Recast100ms: 300, EffectRange: 15}),
    action(3570, 'Tetragrammaton', 'WHM', {MaxCharges: 2}),
    action(16230, 'Physick', 'ACN SMN', {Cast100ms: 15, CooldownGroup: 58}),
    action(9, 'Fast Blade', 'GLA PLD', {Recast100ms: 25, CooldownGroup: 58}),
    // A crafter's: none of the planner's jobs.
    action(100001, 'Basic Synthesis', 'CRP'),
    // Replaces Diagnosis on the hotbar: not flagged as a player action.
    action(24291, 'Eukrasian Diagnosis', 'SGE', {
      IsPlayerAction: false,
      CooldownGroup: 58,
    }),
  ];
  xivApi.sheets.ActionTransient = [
    tooltip(
      7531,
      'Reduces damage taken by 20%.\nAdditional Effect: Increases HP recovery via healing actions on self by 15%\nDuration: 20s',
    ),
    tooltip(
      185,
      "Restores target's HP.\nCure Potency: 300\nAdditional Effect: Grants Galvanize to target, nullifying damage equaling 180% of the amount of HP restored. When critical HP is restored, also grants Catalyze, nullifying damage equaling 180% the amount of HP restored.\nDuration: 30s",
    ),
    // Mitigation written as what's left.
    tooltip(
      188,
      'Creates a designated area in which party members will only suffer 90% of all damage inflicted.\nDuration: 15s\nAdditional Effect: Regen\nCure Potency: 100',
    ),
    // A patch changed it: 700 became 1,700 (a whole number, not "700").
    tooltip(3570, "Restores target's HP.\nCure Potency: 1,700"),
    tooltip(16230, "Restores target's HP.\nCure Potency: 400"),
    // A full-width percent sign, as the game writes it here.
    tooltip(
      24291,
      "Restores target's HP.\nCure Potency: 300\nAdditional Effect: Erects a magicked barrier which nullifies damage equaling 180％ of the amount of HP restored. When critical HP is restored, also grants Differential Diagnosis, nullifying damage equaling 180% the amount of HP restored.\nDuration: 30s",
    ),
  ];
});

afterAll(() => xivApi.reset());

describe('POST /api/planner/catalog/refresh', () => {
  test.each([
    ['no key', null],
    ['a wrong key', 'wrong'],
  ])('refuses %s', async (_case, key) => {
    const response = await refresh(key);

    expect(response.status).toBe(401);
    expect(xivApi.requests).toBeEmpty();
  });

  test('builds the catalog from the game data, every page of it', async () => {
    const response = await refresh();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      dataVersion: 'test-version',
      actionCount: 7,
      effectCount: 6,
    });
    expect(
      xivApi.requests.filter(url => url.includes('/search?sheets=Action')),
    ).toHaveLength(4);
  });

  test('lists actions whose tooltip lost a number of their effects', async () => {
    const response = await refresh();
    const changed = response.body.changed;

    expect(changed).toContainEqual({
      id: 3570,
      name: 'Tetragrammaton',
      missing: ['700'],
    });
    // Matching tooltips aren't listed, however the number is written.
    for (const id of [7531, 185, 188, 16230, 24291]) {
      expect(changed.map((c: {id: number}) => c.id)).not.toContain(id);
    }
    // Effects of actions the game data doesn't have.
    expect(changed).toContainEqual({
      id: 25751,
      name: '',
      missing: ['the action'],
    });
  });
});

describe('GET /api/planner/catalog', () => {
  test('says it is not ready before the first refresh', async () => {
    const response = await request(app).get('/api/planner/catalog');

    expect(response.status).toBe(503);
    expect(response.body.errors.body).toEqual([
      "The fight planner's action list isn't ready yet. Try again later.",
    ]);
  });

  test("answers each action's use and effects, for everyone", async () => {
    await refresh();

    const response = await request(app).get('/api/planner/catalog');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
    const byId = new Map(
      response.body.actions.map((a: {id: number}) => [a.id, a]),
    );
    expect([...byId.keys()]).toEqual([9, 185, 188, 3570, 7531, 16230, 24291]);
    expect(byId.get(7531)).toEqual({
      id: 7531,
      name: 'Rampart',
      icon: 831,
      // The jobs only: classes are left out.
      jobs: ['PLD', 'WAR', 'DRK', 'GNB'],
      level: 8,
      gcd: false,
      castMs: 0,
      recastMs: 90_000,
      charges: 1,
      cooldownGroup: 10,
      range: 0,
      radius: 0,
      effects: [
        expect.objectContaining({
          kind: 'mitigation',
          target: 'self',
          status: 'Rampart',
          percent: 20,
          durationMs: 20_000,
        }),
        expect.objectContaining({kind: 'healingReceived', percent: 15}),
      ],
    });
    expect(byId.get(185)).toMatchObject({
      gcd: true,
      castMs: 2_000,
      recastMs: 2_500,
      range: 30,
    });
    expect(byId.get(3570)).toMatchObject({charges: 2});
    expect(byId.get(16230)).toMatchObject({jobs: ['SMN']});
    expect(byId.get(24291)).toMatchObject({
      jobs: ['SGE'],
      effects: expect.arrayContaining([
        expect.objectContaining({
          kind: 'shield',
          status: 'Differential Diagnosis',
          condition: 'critical heal',
        }),
      ]),
    });
    expect(byId.get(9)).toMatchObject({gcd: true, effects: []});
  });
});

describe('the effect tables', () => {
  test('list each action once', () => {
    const ids = ENTRIES.map(entry => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('give every effect what the planner needs of its kind', () => {
    for (const {id, effects} of ENTRIES) {
      for (const e of effects) {
        const label = `${id} ${e.kind} ${e.status}`;
        if (e.kind === 'mitigation') {
          expect([label, e.percent ?? e.physical ?? e.magic]).not.toEqual([
            label,
            null,
          ]);
          expect([label, e.durationMs]).not.toEqual([label, null]);
        }
        if (e.kind === 'shield' && !e.condition?.startsWith('copies')) {
          expect([label, e.potency ?? (e.of && e.percent)]).not.toEqual([
            label,
            null,
          ]);
        }
        if (e.kind === 'regen' || e.kind === 'heal') {
          expect([label, e.potency ?? e.percent]).not.toEqual([label, null]);
        }
        if (e.status === null) {
          expect([label, e.kind]).toEqual([label, 'heal']);
        }
      }
    }
  });
});
