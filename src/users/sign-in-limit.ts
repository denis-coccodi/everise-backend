import {createHash} from 'crypto';
import {Db, Doc} from '../db';
import {NotFoundError, TooManyRequestsError} from '../errors';
import {UsersService} from './users-service';

// Wrong passwords for one email address since windowStartedAt (ms). The id
// is the address's hash, so the collection holds no addresses.
interface SignInFailuresDoc extends Doc {
  count: number;
  windowStartedAt: number;
}

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

// Slows down guessing one account's password: after MAX_FAILURES wrong
// passwords within 15 minutes, signing in to that address waits until the
// 15 minutes are over. Never a lasting lock. Unknown addresses count the
// same, so the wait says nothing about who has an account.
class SignInLimit {
  private readonly collection = 'signInFailures';

  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Whether the password signs in to the address's account, counting it
  // when it doesn't (no account: false).
  async verify(email: string, password: string): Promise<boolean> {
    await this.check(email);
    let matches: boolean;
    try {
      matches = await this.usersService.verifyPassword(email, password);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      matches = false;
    }
    await (matches ? this.succeeded(email) : this.failed(email));
    return matches;
  }

  private async check(email: string) {
    const doc = await this.db.get<SignInFailuresDoc>(
      this.collection,
      idOf(email),
    );
    const left = doc ? doc.windowStartedAt + WINDOW_MS - this.time() : 0;
    if (doc && left > 0 && doc.count >= MAX_FAILURES) {
      const minutes = Math.ceil(left / 60_000);
      throw new TooManyRequestsError(
        `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or use "Forgot password?".`,
        Math.ceil(left / 1000),
      );
    }
  }

  private async failed(email: string) {
    const id = idOf(email);
    const doc = await this.db.get<SignInFailuresDoc>(this.collection, id);
    if (!doc || doc.windowStartedAt + WINDOW_MS <= this.time()) {
      await this.db.set(this.collection, id, {
        count: 1,
        windowStartedAt: this.time(),
      });
      return;
    }
    await this.db.increment(this.collection, id, {count: 1});
  }

  private async succeeded(email: string) {
    await this.db.delete(this.collection, idOf(email));
  }

  private time() {
    return this.now().getTime();
  }
}

function idOf(email: string) {
  return createHash('sha256').update(email.toLowerCase()).digest('hex');
}

export {SignInLimit};
