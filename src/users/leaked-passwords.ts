import {createHash} from 'crypto';

// How the app reaches Have I Been Pwned's password ranges; tests pass a
// fake.
type PwnedFetch = (
  url: string,
  init: {headers: Record<string, string>; signal?: AbortSignal},
) => Promise<{ok: boolean; status: number; text(): Promise<string>}>;

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 3000;

// Refuses a new password that is on Have I Been Pwned's public list of
// passwords leaked from other sites (Pwned Passwords): those are the first
// ones guessed. The message calls it too common, without words like
// "leaked" that make it sound as if the member's own account was. Only the
// first 5 characters of the password's SHA-1 leave the app (k-anonymity),
// and the answer is padded so its size says nothing either. When the
// service can't be reached the password is allowed: it's a nicety, not a
// lock. Only new passwords are checked; existing ones stay as they are.
class LeakedPasswords {
  constructor(private readonly fetchFn: PwnedFetch) {}

  async check(password: string) {
    if (await this.leaked(password)) {
      throw new RangeError(
        "That password is too common: it's on a list of passwords used on many other websites, so it's easy to guess. Please choose a different one.",
      );
    }
  }

  private async leaked(password: string) {
    const hash = createHash('sha1').update(password).digest('hex');
    const prefix = hash.slice(0, 5).toUpperCase();
    const suffix = hash.slice(5).toUpperCase();
    try {
      const response = await this.fetchFn(RANGE_URL + prefix, {
        headers: {'Add-Padding': 'true'},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Pwned Passwords ${response.status}`);
      // One "SUFFIX:COUNT" per line; padding lines have a count of 0.
      return (await response.text()).split('\n').some(line => {
        const [lineSuffix, count] = line.trim().split(':');
        return lineSuffix === suffix && Number(count) > 0;
      });
    } catch (err) {
      console.error('Leaked password check failed', err);
      return false;
    }
  }
}

export {LeakedPasswords, PwnedFetch};
