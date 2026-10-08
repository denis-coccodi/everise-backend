import {URLSearchParams} from 'url';
import {BotCheckError, UpstreamError} from '../errors';

// How the app calls Cloudflare's siteverify (the parts of fetch it uses);
// tests pass a fake.
type TurnstileFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

// What the site's forms ask the check for; siteverify answers with it, so a
// token from the login form can't sign anyone up.
type TurnstileAction = 'signup' | 'login' | 'resend';

interface SiteverifyAnswer {
  success?: boolean;
  action?: string;
  hostname?: string;
}

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Tokens are at most 2,048 characters.
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 10_000;

// Checks the Cloudflare Turnstile token a form sends, so scripts can't sign
// up, guess passwords or send confirmation emails in bulk. Off until the
// secret (TURNSTILE_SECRET_KEY) is set; then every check fails closed: no
// token, a used one, another form's or another site's is refused.
class TurnstileVerifier {
  constructor(
    private readonly secret: string | undefined,
    // The site's own hostnames (e.g. everise.dev): a token made elsewhere is
    // refused.
    private readonly hostnames: string[],
    private readonly fetchFn: TurnstileFetch = (url, init) =>
      (fetch as unknown as TurnstileFetch)(url, init),
  ) {}

  get enabled() {
    return !!this.secret;
  }

  async verify(
    token: string | undefined,
    action: TurnstileAction,
    remoteIp?: string,
  ) {
    if (!this.secret) return;
    if (!token || token.length > MAX_TOKEN_LENGTH) {
      throw new BotCheckError(
        "Complete the check that you're not a bot, then try again.",
      );
    }
    const answer = await this.siteverify(this.secret, token, remoteIp);
    if (
      answer.success !== true ||
      answer.action !== action ||
      !answer.hostname ||
      !this.hostnames.includes(answer.hostname)
    ) {
      throw new BotCheckError(
        "The check that you're not a bot didn't pass. Try it again.",
      );
    }
  }

  private async siteverify(secret: string, token: string, remoteIp?: string) {
    const body = new URLSearchParams({secret, response: token});
    if (remoteIp) body.set('remoteip', remoteIp);
    try {
      const response = await this.fetchFn(SITEVERIFY_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: body.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`siteverify ${response.status}`);
      return (await response.json()) as SiteverifyAnswer;
    } catch (err) {
      console.error('Turnstile siteverify failed', err);
      throw new UpstreamError(
        "The check that you're not a bot isn't available right now. Try again in a minute.",
      );
    }
  }
}

export {TurnstileAction, TurnstileFetch, TurnstileVerifier};
