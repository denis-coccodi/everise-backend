// One entry of xivpf's answer, with the fields the site reads.
interface XivpfListing {
  updated_at: string;
  listing: {
    id: number;
    // When the game's servers last restarted: listing numbers start again.
    last_server_restart: number;
    recruiter: string;
    description: Text;
    created_world: {id: number; name: string};
    home_world: {id: number; name: string};
    category: string;
    duty_info: {name: Text; high_end: boolean} | null;
    // "Normal" for a duty; "Other" or "Roulette" when the number means a
    // map, a deep dungeon or a roulette (see xivpf-duties.ts).
    duty_type: string;
    beginners_welcome: boolean;
    seconds_remaining: number;
    min_item_level: number;
    num_parties: number;
    objective: {duty_completion: boolean; practice: boolean; loot: boolean};
    conditions: {duty_complete: boolean};
    loot_rules: {greed_only: boolean; lootmaster: boolean};
    search_area: {world: boolean; one_player_per_job: boolean};
    // How many slots the party has (4 for a light party): xivpf always
    // sends 8, the rest unused.
    slot_count: number;
    // The jobs each slot accepts, and who's in it (a job code, or null).
    slots: string[][];
    slots_filled: (string | null)[];
  };
}
type Text = Partial<Record<'en' | 'ja' | 'de' | 'fr', string>>;

export {XivpfListing, Text};
