// What a deletion removed, for the admin's confirmation.
interface DeletedMember {
  username: string;
  wasStagingTester: boolean;
  articles: number;
  comments: number;
}

interface StagingAccessSettings {
  apiToken?: string;
  accountId?: string;
  policyId?: string;
}

interface SyncResult {
  synced: boolean;
  message: string;
}

export {DeletedMember, StagingAccessSettings, SyncResult};
