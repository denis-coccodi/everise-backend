import {ShownListing} from '../party-finder';

// Who shared something, as the message names them.
interface Sharer {
  username: string;
  image: string;
}

// The server's public widget, as the site's home page shows it.
interface DiscordWidget {
  name: string;
  // Who's online now.
  presenceCount: number;
  members: {name: string; avatarUrl: string; status: string}[];
}

// A shared Party Finder listing as it was: its data centre, the listing,
// and the picture of the site's card for it, when the member's browser made
// one.
interface SharedListing {
  dataCentre: string;
  listing: ShownListing;
  picture?: string;
}

export {DiscordWidget, SharedListing, Sharer};
