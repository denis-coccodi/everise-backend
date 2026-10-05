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
  sync(emails: string[]): Promise<SyncResult>;
}

class CloudflareStagingAccess implements StagingAccess {
  constructor(
    private readonly settings: StagingAccessSettings,
    private readonly fetchFn: Fetch = (url, init) =>
      (fetch as unknown as Fetch)(url, init)
  ) {}

  async sync(emails: string[]): Promise<SyncResult> {
    const {apiToken, accountId, groupId} = this.settings;
    if (!apiToken || !accountId || !groupId) {
      return {
        synced: false,
        message:
          "Staging access isn't connected on this backend, so update the staging Access policy by hand.",
      };
    }
    if (emails.length === 0) {
      return {
        synced: false,
        message:
          'Nobody would be left with staging access, so it was not changed.',
      };
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/groups/${groupId}`;
    const headers = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
    try {
      // The group's name and other rules are kept as they are.
      const current = await this.fetchFn(url, {headers});
      if (!current.ok) {
        return failed(`reading the group answered ${current.status}`);
      }
      const {result: group} = (await current.json()) as {
        result: {name: string; exclude?: unknown[]; require?: unknown[]};
      };

      const updated = await this.fetchFn(url, {
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
        return failed(`updating the group answered ${updated.status}`);
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
  StagingAccess,
  StagingAccessSettings,
  SyncResult,
};
