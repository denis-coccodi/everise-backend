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

// Keeps who may open the staging site in Cloudflare Access. The target is
// either an Access group (Access controls → Access groups) used by the
// staging applications' Allow policy, or that reusable policy itself (Access
// controls → Policies). Its Include becomes the admins' and staging testers'
// emails. Each sync writes the whole list, so the database's roles are the
// source of truth and a missed sync is fixed by the next one.
interface StagingAccess {
  // Whether this backend can update the Access group at all.
  readonly connected: boolean;
  sync(emails: string[]): Promise<SyncResult>;
}

// The settings that connect a backend to the Access group.
const STAGING_ACCESS_SETTINGS = {
  apiToken: 'CF_ACCESS_API_TOKEN',
  accountId: 'CF_ACCOUNT_ID',
  // The Access group's or reusable policy's id, or its name.
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

    const access = `https://api.cloudflare.com/client/v4/accounts/${accountId}/access`;
    const headers = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
    const include = emails.map(email => ({email: {email}}));
    // CF_ACCESS_GROUP_ID may hold an id or a name, as shown in the dashboard;
    // spaces, quotes and case don't matter.
    const wanted = clean(groupId);
    const matches = (item: {id: string; name: string}) =>
      item.id === wanted ||
      item.name.trim().toLowerCase() === wanted.toLowerCase();

    try {
      const groups = await this.list<AccessGroup>(`${access}/groups`, headers);
      const group = groups.items.find(matches);
      if (group) {
        // The group's name and other rules are kept as they are.
        const updated = await this.fetchFn(`${access}/groups/${group.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: group.name,
            include,
            exclude: group.exclude ?? [],
            require: group.require ?? [],
          }),
        });
        if (!updated.ok) {
          return failed(
            `updating the group "${group.name}" answered ${
              updated.status
            }${await reason(updated)}`
          );
        }
      } else {
        const policies = await this.list<AccessPolicy>(
          `${access}/policies`,
          headers
        );
        const policy = policies.items.find(matches);
        if (!policy) {
          return failed(notFound(wanted, accountId, groups, policies));
        }
        // Only the Include changes: the policy's name, action and other
        // settings are sent back as they are.
        const updated = await this.fetchFn(`${access}/policies/${policy.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({...writable(policy), include}),
        });
        if (!updated.ok) {
          return failed(
            `updating the policy "${policy.name}" answered ${
              updated.status
            }${await reason(updated)}${
              updated.status === 403 ? POLICY_PERMISSION_HINT : ''
            }`
          );
        }
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

  // Lists Access groups or reusable policies. A refused list counts as
  // empty, with Cloudflare's reason kept for the message.
  private async list<T>(
    url: string,
    headers: Record<string, string>
  ): Promise<{items: T[]; refused?: string}> {
    const response = await this.fetchFn(`${url}?per_page=1000`, {headers});
    if (!response.ok) {
      return {
        items: [],
        refused: `${response.status}${await reason(response)}`,
      };
    }
    const {result} = (await response.json()) as {result?: T[]};
    return {items: result ?? []};
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

// A reusable Access policy: its id and name, and the settings Cloudflare
// accepts when updating it.
type AccessPolicy = {id: string; name: string} & Record<string, unknown>;

const POLICY_FIELDS = [
  'name',
  'decision',
  'include',
  'exclude',
  'require',
  'session_duration',
  'approval_required',
  'approval_groups',
  'isolation_required',
  'purpose_justification_required',
  'purpose_justification_prompt',
  'connection_rules',
  'mfa_config',
];

// Updating a reusable policy takes this permission, besides the groups' one.
const POLICY_PERMISSION_HINT =
  ' (the API token needs "Access: Apps and Policies → Edit")';

// The policy's settings that an update sends back unchanged.
function writable(policy: AccessPolicy) {
  const settings: Record<string, unknown> = {};
  for (const field of POLICY_FIELDS) {
    if (policy[field] !== undefined) settings[field] = policy[field];
  }
  return settings;
}

// No group or policy matches: say what the token can see, and why a list
// was refused.
function notFound(
  wanted: string,
  accountId: string,
  groups: {items: AccessGroup[]; refused?: string},
  policies: {items: AccessPolicy[]; refused?: string}
) {
  const seen = (
    kind: string,
    list: {items: {id: string; name: string}[]; refused?: string},
    hint = ''
  ) =>
    list.refused
      ? `listing the ${kind} answered ${list.refused}${hint}`
      : `the ${kind} there are ${
          list.items.map(i => `"${i.name}" (${i.id})`).join(', ') || 'none'
        }`;
  return `no Access group or policy matches CF_ACCESS_GROUP_ID "${wanted}" on account ${accountId}; ${seen(
    'Access groups',
    groups
  )}; ${seen('policies', policies, POLICY_PERMISSION_HINT)}`;
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
