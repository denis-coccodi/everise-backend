// How the app calls the Cloudflare API (the parts of fetch it uses); tests
// pass a fake.
type Fetch = (
  url: string,
  init?: {method?: string; headers?: Record<string, string>; body?: string}
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

interface StagingAccessSettings {
  apiToken?: string;
  accountId?: string;
  groupId?: string;
}

interface SyncResult {
  synced: boolean;
  message: string;
}

// Keeps who may open the staging site in Cloudflare Access: an Access group
// (Zero Trust → Access → Groups) whose members are the admins' and staging
// testers' emails, used by the staging applications' Allow policy. Each sync
// writes the whole list, so the database's roles are the source of truth and
// a missed sync is fixed by the next one.
interface StagingAccess {
  // Whether this backend can update the Access group at all.
  readonly connected: boolean;
  sync(emails: string[]): Promise<SyncResult>;
}

// The settings that connect a backend to the Access group.
const STAGING_ACCESS_SETTINGS = {
  apiToken: 'CF_ACCESS_API_TOKEN',
  accountId: 'CF_ACCOUNT_ID',
  // The group's id, or its name.
  groupId: 'CF_ACCESS_GROUP_ID',
} as const;

class CloudflareStagingAccess implements StagingAccess {
  constructor(
    private readonly settings: StagingAccessSettings,
    private readonly fetchFn: Fetch = (url, init) =>
      (fetch as unknown as Fetch)(url, init)
  ) {}

  get connected() {
    return this.missingSettings().length === 0;
  }

  async sync(emails: string[]): Promise<SyncResult> {
    const {apiToken, accountId, groupId} = this.settings;
    if (!apiToken || !accountId || !groupId) {
      return {
        synced: false,
        message: `Staging access isn't connected on this backend (missing ${this.missingSettings().join(
          ', '
        )}), so the role is saved but the staging Access list wasn't changed.`,
      };
    }
    if (emails.length === 0) {
      return {
        synced: false,
        message:
          'Nobody would be left with staging access, so it was not changed.',
      };
    }

    const groups = `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/groups`;
    const headers = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
    try {
      // CF_ACCESS_GROUP_ID may hold the group's id or its name, as shown in
      // the dashboard; spaces, quotes and case don't matter.
      const listed = await this.fetchFn(`${groups}?per_page=1000`, {headers});
      if (!listed.ok) {
        return failed(
          `listing the Access groups answered ${listed.status}${await reason(
            listed
          )}`
        );
      }
      const {result} = (await listed.json()) as {result?: AccessGroup[]};
      const all = result ?? [];
      const wanted = clean(groupId);
      const group = all.find(
        g =>
          g.id === wanted ||
          g.name.trim().toLowerCase() === wanted.toLowerCase()
      );
      if (!group) {
        const seen = all.map(g => `"${g.name}" (${g.id})`).join(', ');
        return failed(
          `no Access group matches CF_ACCESS_GROUP_ID "${wanted}" on account ${accountId}; the groups there are ${
            seen || 'none'
          }`
        );
      }

      // The group's name and other rules are kept as they are.
      const updated = await this.fetchFn(`${groups}/${group.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: group.name,
          include: emails.map(email => ({email: {email}})),
          exclude: group.exclude ?? [],
          require: group.require ?? [],
        }),
      });
      if (!updated.ok) {
        return failed(
          `updating "${group.name}" answered ${updated.status}${await reason(
            updated
          )}`
        );
      }
      return {
        synced: true,
        message: `Staging access updated: ${emails.length} ${
          emails.length === 1 ? 'person' : 'people'
        } can open staging.`,
      };
    } catch (err) {
      return failed((err as Error).message);
    }
  }

  // The names of the settings this backend lacks to update the group.
  missingSettings(): string[] {
    return Object.entries(STAGING_ACCESS_SETTINGS)
      .filter(([key]) => !this.settings[key as keyof StagingAccessSettings])
      .map(([, name]) => name);
  }
}

interface AccessGroup {
  id: string;
  name: string;
  exclude?: unknown[];
  require?: unknown[];
}

// A setting as pasted: without surrounding spaces or quotes.
function clean(value: string) {
  return value
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

// Cloudflare's own explanation of a refusal, e.g. ": Authentication error".
async function reason(response: {json(): Promise<unknown>}) {
  try {
    const body = (await response.json()) as {errors?: {message?: string}[]};
    const messages = (body.errors ?? []).map(e => e.message).filter(Boolean);
    return messages.length ? `: ${messages.join('; ')}` : '';
  } catch {
    return '';
  }
}

function failed(reason: string): SyncResult {
  console.error(`Staging access sync failed: ${reason}`);
  return {
    synced: false,
    message: `Staging access couldn't be updated (Cloudflare: ${reason}). The role is saved; try "Sync staging access" again.`,
  };
}

export {
  CloudflareStagingAccess,
  Fetch,
  STAGING_ACCESS_SETTINGS,
  StagingAccess,
  StagingAccessSettings,
  SyncResult,
};
