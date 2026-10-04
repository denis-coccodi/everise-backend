import {Db, Doc} from '../db';
import {DutyGroup, Roulette} from './duty';
import {XivApiClient} from './xivapi-client';

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

  constructor(private readonly db: Db, private readonly xivApi: XivApiClient) {}

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

  async getDutyGroups(): Promise<RefreshInfo & {groups: DutyGroup[]}> {
    const docs = await this.db.find<DutyGroupDoc>(this.groupsCollection, {
      orderBy: [{field: 'order', direction: 'asc'}],
    });

    return {
      ...(await this.getRefreshInfo()),
      groups: docs.map(({name, order, duties}) => ({name, order, duties})),
    };
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
