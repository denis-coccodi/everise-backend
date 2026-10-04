import {Db, Doc} from '../db';
import {Duty, DutyGroup, DutyStatus, Roulette} from './duty';
import {
  frontlineMapAt,
  frontlineSchedule,
  isSameMap,
} from './frontline-rotation';
import {XivApiClient} from './xivapi-client';

// One full Frontline cycle.
const FRONTLINE_SCHEDULE_DAYS = 8;

interface DutyGroupDoc extends Doc, DutyGroup {}

interface RoulettesDoc extends Doc {
  roulettes: Roulette[];
}

interface RefreshDoc extends Doc {
  dataVersion: string;
  fetchedAt: string;
  dutyCount: number;
  rouletteCount: number;
}

interface RefreshInfo {
  dataVersion: string | null;
  fetchedAt: string | null;
}

// Caches the FFXIV duty and roulette lists from XIVAPI in the database. Each
// duty group is its own document to stay well under the storage's value size
// limit; the roulettes fit in one.
class DutiesService {
  private readonly groupsCollection = 'dutyGroups';
  private readonly roulettesCollection = 'dutyRoulettes';
  private readonly refreshesCollection = 'dutyRefreshes';

  constructor(
    private readonly db: Db,
    private readonly xivApi: XivApiClient,
    private readonly now: () => Date = () => new Date()
  ) {}

  // Downloads everything first, so a failed download leaves the cache as it was.
  async refresh() {
    const data = await this.xivApi.fetchDutyData();

    for (const collection of [
      this.groupsCollection,
      this.roulettesCollection,
      this.refreshesCollection,
    ]) {
      for (const doc of await this.db.find(collection)) {
        await this.db.delete(collection, doc.id);
      }
    }

    for (const group of data.groups) {
      await this.db.create(this.groupsCollection, {...group});
    }
    await this.db.create(this.roulettesCollection, {roulettes: data.roulettes});

    const refresh = {
      dataVersion: data.dataVersion,
      fetchedAt: new Date().toISOString(),
      dutyCount: data.groups.reduce((n, g) => n + g.duties.length, 0),
      rouletteCount: data.roulettes.length,
    };
    await this.db.create(this.refreshesCollection, refresh);

    return {
      ...refresh,
      groups: data.groups.map(g => ({name: g.name, count: g.duties.length})),
    };
  }

  async getDutyGroups(): Promise<
    RefreshInfo & {groups: DutyGroup<DutyStatus>[]}
  > {
    const docs = await this.findGroups();
    const isActive = this.isActiveFrontline(frontlineMapAt(this.now()).map);

    return {
      ...(await this.getRefreshInfo()),
      groups: docs.map(({name, order, duties}) => ({
        name,
        order,
        duties: duties.map(duty => ({
          ...duty,
          activeFrontline: isActive(duty),
        })),
      })),
    };
  }

  // Today's Frontline map and the rest of the cycle, computed from the fixed
  // rotation. dutyId links a map to its duty in GET /api/duties, or is null
  // before the first refresh.
  async getFrontline() {
    const frontlineDuties = (await this.findGroups())
      .flatMap(group => group.duties)
      .filter(duty => duty.pvpType === 'Frontline');

    const schedule = frontlineSchedule(this.now(), FRONTLINE_SCHEDULE_DAYS).map(
      ({map, from, until}) => ({
        map,
        dutyId:
          frontlineDuties.find(duty => isSameMap(duty.name, map))?.id ?? null,
        from: from.toISOString(),
        until: until.toISOString(),
      })
    );

    return {active: schedule[0], schedule};
  }

  private findGroups() {
    return this.db.find<DutyGroupDoc>(this.groupsCollection, {
      orderBy: [{field: 'order', direction: 'asc'}],
    });
  }

  private isActiveFrontline(activeMap: string) {
    return (duty: Duty) =>
      duty.pvpType === 'Frontline' && isSameMap(duty.name, activeMap);
  }

  async getRoulettes(): Promise<RefreshInfo & {roulettes: Roulette[]}> {
    const [doc] = await this.db.find<RoulettesDoc>(this.roulettesCollection);

    return {
      ...(await this.getRefreshInfo()),
      roulettes: doc?.roulettes ?? [],
    };
  }

  private async getRefreshInfo(): Promise<RefreshInfo> {
    const [doc] = await this.db.find<RefreshDoc>(this.refreshesCollection);

    return {
      dataVersion: doc?.dataVersion ?? null,
      fetchedAt: doc?.fetchedAt ?? null,
    };
  }
}

export {DutiesService};
