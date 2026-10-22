import {Db} from '../db';
import {TooManyRequestsError} from '../errors';
import {secondsToMidnightUtc} from './character-ai';
import {MEMBER_SHARE, day} from './room-prompts';
import {UsageDoc} from './sands-model';

// The Workers AI Neurons the characters may spend a day: the site's, and a
// share of them for each payer (a member, or the guests whose roulette
// results Tataru posts), so a few keen talkers can't close the Waking Sands
// for everyone.
class NeuronBudget {
  private readonly usage = 'chatUsage';

  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
    // The Neurons this backend may spend a day (WAKING_SANDS_DAILY_NEURONS).
    // Staging and production share the account's free 10,000, so together
    // they must stay under them.
    private readonly dailyNeurons: number,
  ) {}

  get available() {
    return this.dailyNeurons > 0;
  }

  // Refuses once the payer's or the site's Neurons for the day are spent.
  // A reply costs a few, so the last one may go a little over.
  async check(payer: string) {
    const now = this.now();
    const usage =
      (await this.db.get<UsageDoc>(this.usage, day(now))) ??
      ({} as Partial<UsageDoc>);
    const mine = usage.members?.[payer] ?? 0;
    if ((usage.neurons ?? 0) >= this.dailyNeurons) {
      throw new TooManyRequestsError(
        'The Waking Sands is closed for the rest of the day. Come back after midnight UTC!',
        secondsToMidnightUtc(now),
      );
    }
    if (mine >= this.dailyNeurons * MEMBER_SHARE) {
      throw new TooManyRequestsError(
        "You've talked a great deal today, and the Scions need their rest too. Come back after midnight UTC!",
        secondsToMidnightUtc(now),
      );
    }
  }

  async spend(payer: string, neurons: number) {
    // Added in one step, so replies ending together all count.
    await this.db.increment(this.usage, day(this.now()), {
      neurons,
      [`members.${payer}`]: neurons,
    });
  }
}

export {NeuronBudget};
