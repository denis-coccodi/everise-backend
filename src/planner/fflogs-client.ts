import {
  ForbiddenError,
  NotFoundError,
  UnavailableError,
  UpstreamError,
} from '../errors';
import {FflogsSettings} from './fflogs-model';

const TOKEN_URL = 'https://www.fflogs.com/oauth/token';
const API_URL = 'https://www.fflogs.com/api/v2/client';
// A token is asked for again this long before FFLogs says it expires.
const TOKEN_MARGIN_MS = 60 * 60 * 1000;

// The minimal fetch the client needs; the Worker's global fetch fits it.
type FflogsFetch = (
  url: string,
  init: {method: 'POST'; headers: Record<string, string>; body: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

interface GraphQlAnswer {
  data?: unknown;
  errors?: {message?: unknown}[];
}

const notSetUp = () =>
  new UnavailableError("The fight planner isn't set up on this site yet.");
const unreachable = () =>
  new UpstreamError("FFLogs couldn't be reached. Try again in a few minutes.");

// Asks FFLogs' v2 API (GraphQL) as the site's client: the public and
// unlisted reports only. The token is kept until shortly before it
// expires, and asked for again if FFLogs stops taking it.
class FflogsClient {
  private token?: {value: string; until: number};

  constructor(
    private readonly settings: FflogsSettings,
    private readonly fetchFn: FflogsFetch,
    private readonly now: () => Date,
  ) {}

  get available() {
    return !!(this.settings.clientId && this.settings.clientSecret);
  }

  // The query's data. A report that doesn't exist is a NotFoundError, a
  // private one a ForbiddenError.
  async query(query: string, variables: Record<string, unknown>) {
    if (!this.available) throw notSetUp();
    let response = await this.post(query, variables, await this.bearer());
    if (response.status === 401) {
      this.token = undefined;
      response = await this.post(query, variables, await this.bearer());
    }
    if (response.status === 429) {
      throw new UpstreamError(
        'FFLogs is busy right now. Try again in a few minutes.',
      );
    }
    if (!response.ok) {
      console.error(`FFLogs: the API answered ${response.status}`);
      throw unreachable();
    }
    const answer = (await response.json()) as GraphQlAnswer | null;
    const message = answer?.errors
      ?.map(error => String(error.message ?? ''))
      .join('; ');
    if (message) throw reportError(message);
    if (!answer?.data) throw unreachable();
    return answer.data;
  }

  private post(
    query: string,
    variables: Record<string, unknown>,
    token: string,
  ) {
    return this.fetchFn(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({query, variables}),
    });
  }

  private async bearer() {
    const at = this.now().getTime();
    if (this.token && this.token.until > at) return this.token.value;
    const basic = btoa(
      `${this.settings.clientId}:${this.settings.clientSecret}`,
    );
    const response = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const body = (await response.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (!response.ok || typeof body?.access_token !== 'string') {
      console.error(`FFLogs: the token request answered ${response.status}`);
      throw unreachable();
    }
    const seconds = typeof body.expires_in === 'number' ? body.expires_in : 0;
    this.token = {
      value: body.access_token,
      until: at + Math.max(seconds * 1000 - TOKEN_MARGIN_MS, 0),
    };
    return this.token.value;
  }
}

// FFLogs answers a missing or private report with a GraphQL error.
function reportError(message: string) {
  if (/does not exist/i.test(message)) {
    return new NotFoundError(
      "There's no FFLogs report with that link. Check that it was copied whole.",
    );
  }
  if (/permission/i.test(message)) {
    return new ForbiddenError(
      'That FFLogs report is private. Make it public or unlisted on FFLogs, then try again.',
    );
  }
  // FFLogs archives old reports: only their owner's subscription reads them.
  if (/archived/i.test(message)) {
    return new ForbiddenError(
      'FFLogs has archived that report, so it can no longer be read. Upload the log again, or pick a newer report.',
    );
  }
  console.error(`FFLogs: the API answered "${message}"`);
  return unreachable();
}

export {FflogsClient, FflogsFetch};
