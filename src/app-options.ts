import {StagingAccess} from './admin';
import {DiscordFetch} from './discord';
import {EmailSender} from './email';
import {EventsFetch} from './events';
import {FileStore} from './files';
import {GifFetch} from './media';
import {MarketSource, UniversalisFetch} from './market';
import {PartyFinderSource} from './party-finder';
import {FflogsFetch, FflogsSettings, PullSource} from './planner';
import {RelayFetch} from './relays';
import {OAuthFetch, SocialLoginSettings} from './social-login';
import {TurnstileFetch} from './turnstile';
import {PwnedFetch} from './users';
import {VenuesFetch} from './venues';
import {LoadBundledPicture} from './waking-sands';
import {CharacterModel} from './waking-sands';

// What createApp (src/app.ts) can be given instead of its defaults: the
// Worker's bindings, and the tests' fakes for every outside service.
interface AppOptions {
  // Where uploaded images' bytes are kept (R2 in the Worker; memory without).
  fileStore?: FileStore;
  // Reads a picture from public/ (the Worker's static assets).
  loadBundledPicture?: LoadBundledPicture;
  // Where staging testers are given access to the staging site.
  stagingAccess?: StagingAccess;
  // Sign-in with Google and Discord: the apps' settings, and how the app
  // reaches the providers.
  socialLogin?: {settings: SocialLoginSettings; fetch?: OAuthFetch};
  // The Discord channel members share in, and the server's widget.
  discord?: {webhookUrl?: string; guildId?: string; fetch?: DiscordFetch};
  // The Discord channels the site relays (weekly posts, hunt trains): the
  // bot's token, the channels, the hunt groups' servers ("<id>:<DC>,…"),
  // and how the app reaches Discord.
  relays?: {
    botToken?: string;
    weeklyChannelId?: string;
    huntsChannelId?: string;
    huntSources?: string;
    fetch?: RelayFetch;
  };
  // The GIF search: GIPHY's key, and how the app reaches it.
  gifSearch?: {apiKey?: string; fetch?: GifFetch};
  // Sends the email confirmation links; without one, emails aren't
  // confirmed.
  emailSender?: EmailSender;
  // The Waking Sands: what writes the characters' lines (Workers AI), and
  // the Neurons it may spend a day. Without a model, or with no Neurons,
  // the chat isn't open.
  wakingSands?: {model?: CharacterModel; dailyNeurons?: number};
  // The Party Finder listings (xivpf.com). In the Worker, the Durable Object
  // that reads them; otherwise a board in this process.
  partyFinder?: PartyFinderSource;
  // The market board's price histories (Universalis). In the Worker, a
  // Durable Object per item and place; without one, the page says so.
  market?: MarketSource;
  // How the app reaches Universalis for the market's current listings.
  universalis?: UniversalisFetch;
  // How the app reaches FFXIV Venues for the player-run venues.
  venues?: VenuesFetch;
  // How the app reaches Partake for the community events.
  events?: EventsFetch;
  // The fight planner's FFLogs API client, how the app reaches FFLogs, and
  // where pulls are read (in the Worker, a Durable Object).
  fflogs?: {settings: FflogsSettings; fetch: FflogsFetch; pulls?: PullSource};
  // The bot check (Cloudflare Turnstile): its secret, the site's hostnames,
  // and how the app reaches siteverify. Without a secret, nothing is checked.
  turnstile?: {
    secretKey?: string;
    hostnames?: string[];
    fetch?: TurnstileFetch;
  };
  // How the app reaches Have I Been Pwned to refuse new passwords that
  // leaked. Without it (local runs, tests) they aren't checked.
  leakedPasswords?: PwnedFetch;
  // The bytes everyone's uploads may keep together.
  uploadStorageBytes?: number;
  // Filled in by createApp: the jobs the Worker's cron trigger runs (and
  // tests call).
  jobs?: AppJobs;
}

interface AppJobs {
  // The shared Party Finder listings no longer up: their sharers told.
  checkSharedListings?: () => Promise<void>;
  // The relayed Discord channels read again.
  readRelays?: () => Promise<void>;
}

export {AppJobs, AppOptions};
