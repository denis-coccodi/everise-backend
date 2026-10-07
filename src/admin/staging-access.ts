// How the app calls the Cloudflare API (the parts of fetch it uses); tests
// pass a fake.
type Fetch = (
  url: string,
  init?: {method?: string; headers?: Record<string, string>; body?: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

interface StagingAccessSettings {
  apiToken?: string;
  accountId?: string;
  policyId?: string;
}

interface SyncResult {
  synced: boolean;
  message: string;
}

// Keeps who may open the staging site in Cloudflare Access: a reusable
// Access policy (Zero Trust → Access controls → Policies), used by both
// staging applications, whose Include is the admins' and staging testers'
// emails. Each sync writes the whole list, so the database's roles are the
// source of truth and a missed sync is fixed by the next one.
interface StagingAccess {
  // Whether this backend can update the policy at all.
  readonly connected: boolean;
  sync(emails: string[]): Promise<SyncResult>;
}

// The settings that connect a backend to the policy.
const STAGING_ACCESS_SETTINGS = {
  apiToken: 'CF_ACCESS_API_TOKEN',
  accountId: 'CF_ACCOUNT_ID',
  // The policy's id, or its name.
  policyId: 'CF_ACCESS_POLICY_ID',
} as const;

// What the token needs, named when Cloudflare refuses.
const PERMISSION_HINT =
  ' (the API token needs "Access: Apps and Policies → Edit")';

// The settings an update of a reusable policy takes; the rest of what
// Cloudflare lists (id, dates, app count) is read-only.
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

type AccessPolicy = {id: string; name: string} & Record<string, unknown>;

class CloudflareStagingAccess implements StagingAccess {
  constructor(
    private readonly settings: StagingAccessSettings,
    private readonly fetchFn: Fetch = (url, init) =>
      (fetch as unknown as Fetch)(url, init),
  ) {}

  get connected() {
    return this.missingSettings().length === 0;
  }

  async sync(emails: string[]): Promise<SyncResult> {
    const {apiToken, accountId, policyId} = this.settings;
    if (!apiToken || !accountId || !policyId) {
      return {
        synced: false,
        message: `Staging access isn't connected on this backend (missing ${this.missingSettings().join(
          ', ',
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

    const policies = `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/policies`;
    const headers = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
    // The setting may hold the policy's id or its name, as the dashboard
    // shows them; spaces, quotes and case don't matter.
    const wanted = clean(policyId);

    try {
      const listed = await this.fetchFn(`${policies}?per_page=1000`, {
        headers,
      });
      if (!listed.ok) {
        return failed(
          `listing the Access policies answered ${listed.status}${await reason(
            listed,
          )}${PERMISSION_HINT}`,
        );
      }
      const {result} = (await listed.json()) as {result?: AccessPolicy[]};
      const all = result ?? [];
      const policy = all.find(
        p =>
          p.id === wanted ||
          p.name.trim().toLowerCase() === wanted.toLowerCase(),
      );
      if (!policy) {
        const seen = all.map(p => `"${p.name}" (${p.id})`).join(', ');
        return failed(
          `no Access policy matches CF_ACCESS_POLICY_ID "${wanted}" on account ${accountId}; the policies there are ${
            seen || 'none'
          }`,
        );
      }

      // Only the Include changes: the policy's name, action and other
      // settings are sent back as they are.
      const updated = await this.fetchFn(`${policies}/${policy.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          ...writable(policy),
          include: emails.map(email => ({email: {email}})),
        }),
      });
      if (!updated.ok) {
        return failed(
          `updating the policy "${policy.name}" answered ${
            updated.status
          }${await reason(updated)}${
            updated.status === 403 ? PERMISSION_HINT : ''
          }`,
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

  // The names of the settings this backend lacks to update the policy.
  missingSettings(): string[] {
    return Object.entries(STAGING_ACCESS_SETTINGS)
      .filter(([key]) => !this.settings[key as keyof StagingAccessSettings])
      .map(([, name]) => name);
  }
}

// The policy's settings that an update sends back unchanged.
function writable(policy: AccessPolicy) {
  const settings: Record<string, unknown> = {};
  for (const field of POLICY_FIELDS) {
    if (policy[field] !== undefined) settings[field] = policy[field];
  }
  return settings;
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
