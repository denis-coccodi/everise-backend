import {Doc} from '../db';
import {DataCentre} from '../party-finder';

type NewShare = Omit<SharedListingDoc, keyof Doc>;

// A Party Finder listing a member shared, watched until it's no longer up.
interface SharedListingDoc extends Doc {
  listingId: string;
  dataCentre: DataCentre;
  // What the listing is for, as it was shared ("The Omega Protocol").
  title: string;
  sharerId: string;
  // The member's name then, for the Discord message.
  sharerName: string;
  // The post it was shared as, if it was.
  articleId?: string;
  // Shared in the Everise Discord too (or only there).
  discord: boolean;
}

export {NewShare, SharedListingDoc};
