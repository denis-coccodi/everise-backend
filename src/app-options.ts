import {StagingAccess} from './admin';
import {DiscordFetch} from './discord';
import {EmailSender} from './email';
import {FileStore} from './files';
import {GifFetch} from './media';
import {PartyFinderSource} from './party-finder';
import {OAuthFetch, SocialLoginSettings} from './social-login';
import {TurnstileFetch} from './turnstile';
import {LoadBundledPicture} from './users';
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
  // Sign-in with Google and Facebook: the apps' settings, and how the app
  // reaches the providers.
  socialLogin?: {settings: SocialLoginSettings; fetch?: OAuthFetch};
  // The Discord channel members share in, and the server's widget.
  discord?: {webhookUrl?: string; guildId?: string; fetch?: DiscordFetch};
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
  // The bot check (Cloudflare Turnstile): its secret, the site's hostnames,
  // and how the app reaches siteverify. Without a secret, nothing is checked.
  turnstile?: {
    secretKey?: string;
    hostnames?: string[];
    fetch?: TurnstileFetch;
  };
  // The bytes everyone's uploads may keep together.
  uploadStorageBytes?: number;
}

export {AppOptions};
