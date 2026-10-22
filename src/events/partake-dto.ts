// Partake's event, as far as the site uses it. Fields may be missing or
// null, so every one is checked.
interface PartakeEvent {
  id?: number;
  title?: string | null;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
  locationData?: {
    dataCenter?: {name?: string | null} | null;
    server?: {name?: string | null} | null;
  } | null;
  ageRating?: string | null;
  tags?: (string | null)[] | null;
  attachments?: (string | null)[] | null;
  isRecurring?: boolean | null;
  attendeeCount?: number | null;
  game?: {id?: string | null} | null;
  team?: {
    name?: string | null;
    iconUrl?: string | null;
    discordUrl?: string | null;
    websiteUrl?: string | null;
  } | null;
}

export {PartakeEvent};
