import {Db} from '../db';
import {DATA_CENTRE_NAMES, DataCentre} from '../party-finder';
import {RELAYED_POSTS} from './relay-docs';
import {
  fashionReportDays,
  islandSeasonDays,
  nextJudgingAt,
  nextResets,
} from './weekly-times';
import {RelayChannel, RelayedPostDoc} from './relay-model';

// What the site shows of the relayed channels: the weekly page (the
// resets, the latest Fashion Report and Island Sanctuary recommendations,
// with the days they're for) and the hunt trains, the newest first.
class RelaysService {
  constructor(
    private readonly db: Db,
    // The bot is set up: the channels are read.
    private readonly available: boolean,
    private readonly huntSources: Record<string, DataCentre>,
    private readonly now: () => Date,
  ) {}

  async weekly() {
    const now = this.now();
    const posts = await this.posts('weekly');
    const fashion = posts.find(post => post.kind === 'fashion-report');
    const island = posts.find(post => post.kind === 'island-sanctuary');
    return {
      available: this.available,
      resets: nextResets(now),
      fashionReport: fashion
        ? {message: fashion.message, ...fashionReportDays(fashion.postedAt)}
        : null,
      nextJudgingAt: nextJudgingAt(now),
      islandSanctuary: island
        ? {message: island.message, ...islandSeasonDays(island.postedAt)}
        : null,
    };
  }

  // The hunt trains, of one data centre or all, the latest start first.
  async hunts(dataCentre?: DataCentre) {
    const startOf = (post: RelayedPostDoc) =>
      (post.startsAt ?? post.postedAt).getTime();
    const all = await this.posts('hunts');
    const posts = all
      .filter(post => !dataCentre || post.dataCentre === dataCentre)
      .sort((a, b) => startOf(b) - startOf(a));
    // Those set up, and any a train's world is on, in the game's order.
    const relayed = new Set([
      ...Object.values(this.huntSources),
      ...all.map(post => post.dataCentre),
    ]);
    return {
      available: this.available,
      dataCentres: DATA_CENTRE_NAMES.filter(name => relayed.has(name)),
      posts: posts.map(post => ({
        dataCentre: post.dataCentre!,
        startsAt: post.startsAt ?? post.postedAt,
        message: post.message,
      })),
    };
  }

  // A channel's relayed messages, the newest first (a few dozen at most).
  private async posts(channel: RelayChannel) {
    const posts = await this.db.find<RelayedPostDoc>(RELAYED_POSTS, {
      where: [{field: 'channel', op: '==', value: channel}],
    });
    return posts.sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
  }
}

export {RelaysService};
