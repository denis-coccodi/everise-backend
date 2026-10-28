import {createHash} from 'crypto';
import {Db, Doc} from '../db';
import {TooManyRequestsError} from '../errors';

const LOOKUPS = 'plannerGuestLookups';
const HOUR_MS = 60 * 60 * 1000;

// What a guest may ask of FFLogs in an hour: new reports and new pulls, each
// counted apart. Each guest (by IP address) gets PER_GUEST of each, and all
// guests together ALL_GUESTS, so members always have most of the site's
// FFLogs points (1,000 an hour; a pull costs about 10). Anything already
// read (a kept report, a cached pull) costs nothing and isn't counted.
const PER_GUEST = 10;
const ALL_GUESTS = 40;

type LookupKind = 'report' | 'pull';

// One document an hour: per kind, each guest's count and everyone's.
interface HourDoc extends Doc {
  report?: Record<string, number>;
  pull?: Record<string, number>;
}

// Counts guests' FFLogs lookups, and refuses one past the hour's limits.
class GuestLookups {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
  ) {}

  async spend(kind: LookupKind, clientAddress: string) {
    const now = this.now().getTime();
    const hour = Math.floor(now / HOUR_MS);
    const guest = hash(clientAddress);
    // Counted in one step first, so lookups arriving together all count.
    const counts = (
      await this.db.increment<HourDoc>(LOOKUPS, `h${hour}`, {
        [`${kind}.${guest}`]: 1,
        [`${kind}.all`]: 1,
      })
    )[kind];
    // The hour before last is no longer needed.
    if ((counts?.all ?? 0) === 1) await this.db.delete(LOOKUPS, `h${hour - 2}`);
    const seconds = Math.ceil(((hour + 1) * HOUR_MS - now) / 1000);
    const what = kind === 'report' ? 'reports' : 'pulls';
    if ((counts?.[guest] ?? 0) > PER_GUEST) {
      throw new TooManyRequestsError(
        `That's ${PER_GUEST} new ${what} this hour without an account. Sign in (anyone can sign up) to load more, or try again later.`,
        seconds,
      );
    }
    if ((counts?.all ?? 0) > ALL_GUESTS) {
      throw new TooManyRequestsError(
        `Guests have loaded all the new ${what} they can this hour. Sign in (anyone can sign up) to load more, or try again later.`,
        seconds,
      );
    }
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export {ALL_GUESTS, GuestLookups, PER_GUEST};
