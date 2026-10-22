import {FileStore} from '../files';
import {DiscordChannel} from './discord-channel';
import {imagesOf} from './relay-message';
import {RelayImage, RelayMessage} from './discord-dto';

// The pictures kept, by their type: the file's name ends with it.
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const TYPES = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([type, extension]) => [extension, type]),
);

// A copied picture's name, and its type: Discord's attachment id (it never
// changes for the same file), e.g. 1558082857505792000.png; for a picture
// from elsewhere, the message's id and a hash of the address.
const FILE_NAME = /^\d+(-[a-z0-9]+)?\.(png|jpg|gif|webp)$/;

// Discord's file server: links to it are signed and expire.
const DISCORD_FILE =
  /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/(ephemeral-)?attachments\/\d+\/(\d+)\//;

// The R2 key of a copied picture.
function key(file: string) {
  return `relays/${file}`;
}

function filesOf(message: RelayMessage) {
  return imagesOf(message).flatMap(image => (image.file ? [image.file] : []));
}

// A picture's address without the signature Discord adds (?ex=…&hm=…).
function unsigned(url: string) {
  return url.split('?')[0];
}

// A short, stable hash of an address (FNV-1a), for a copy's name.
function hashOf(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// The type of a copied picture, from its name; undefined for a name that
// isn't one.
function relayImageType(file: string) {
  return FILE_NAME.test(file) ? TYPES[file.split('.')[1]] : undefined;
}

// Copies the pictures of relayed messages that live on Discord's file
// server into R2, where they don't expire. Other pictures (Tenor, Imgur)
// stay linked, unless every picture is asked for: the Fashion Report's is
// sometimes at an address that always shows the current week's.
class RelayImages {
  constructor(
    private readonly files: FileStore,
    private readonly channel: DiscordChannel,
  ) {}

  // Sets `file` on each picture copied, reusing the copies of `before` (the
  // message as stored, when it was edited). A picture that can't be copied
  // keeps its link.
  async copy(message: RelayMessage, before?: RelayMessage, every = false) {
    const copied = new Map(
      (before ? imagesOf(before) : [])
        .filter(image => image.file)
        .map(image => [unsigned(image.url), image.file!]),
    );
    // Thumbnails (a bot's icon) stay linked all the same.
    const thumbnails = new Set(message.embeds.map(embed => embed.thumbnail));
    for (const image of imagesOf(message)) {
      const own = every && !thumbnails.has(image);
      const id =
        DISCORD_FILE.exec(image.url)?.[3] ??
        (own ? `${message.id}-${hashOf(unsigned(image.url))}` : undefined);
      if (!id) continue;
      image.file =
        copied.get(unsigned(image.url)) ?? (await this.save(id, image));
    }
  }

  // The bytes of a copied picture, and its type.
  async read(file: string) {
    const contentType = relayImageType(file);
    if (!contentType) return undefined;
    const bytes = await this.files.get(key(file));
    return bytes && {bytes, contentType};
  }

  async delete(messages: RelayMessage[], keep: RelayMessage[] = []) {
    const kept = new Set(keep.flatMap(filesOf));
    const files = messages
      .flatMap(filesOf)
      .filter(file => !kept.has(file))
      .map(key);
    if (files.length) await this.files.delete(files);
  }

  private async save(id: string, image: RelayImage) {
    const download = await this.channel.download(image.url);
    const type = download?.contentType.split(';')[0].trim();
    const extension = type && EXTENSIONS[type];
    if (!download || !extension) {
      console.error(`Relays: picture ${unsigned(image.url)} not copied`);
      return undefined;
    }
    const file = `${id}.${extension}`;
    await this.files.put(key(file), download.bytes, type);
    return file;
  }
}

export {RelayImages, relayImageType};
