import {Db, Write} from '../db';
import {DATA_CENTRE_NAMES, DataCentre} from '../party-finder';
import {DiscordChannel} from './discord-channel';
import {
  RELAYED_POSTS,
  RELAY_CURSORS,
  RelayChannel,
  RelayCursorDoc,
  RelayKind,
  RelayedPostDoc,
} from './relay-docs';
import {RelayImages} from './relay-images';
import {RelayMessage, isNewer} from './relay-message';
import {trainDataCentre, trainStartsAt} from './hunt-trains';
import {outdated} from './relay-retention';

// The servers whose channels the weekly channel follows: the Fashion
// Report's infographics (Kaiyoko's "Fashion Reporter") and the Island
// Sanctuary workshop recommendations (Overseas Casuals).
const FASHION_REPORT_SOURCE = '620710123601526794';
const ISLAND_SANCTUARY_SOURCE = '1034534280757522442';

const DAY_MS = 24 * 60 * 60 * 1000;
// Messages older than this aren't kept even on a first read: a week's
// posts are past by then, and a hunt train over.
const KEPT_MS: Record<RelayChannel, number> = {
  weekly: 8 * DAY_MS,
  hunts: DAY_MS,
};
// New or edited messages handled per read of a channel: each can copy a
// picture, and a Worker run may only make so many requests. The rest wait
// for the next read.
const MAX_PER_READ = 10;

interface RelaySettings {
  weeklyChannelId?: string;
  huntsChannelId?: string;
  // Which data centre each hunt group's channel is for, by channel id (or
  // by server id, for a group with one channel).
  huntSources: Record<string, DataCentre>;
}

// The hunt groups' channels, from the setting "<id>:<data centre>,…" (the
// id of the followed channel, or of its server).
// A data centre the game doesn't have is left out (and logged).
function huntSources(setting: string): Record<string, DataCentre> {
  const sources: Record<string, DataCentre> = {};
  for (const entry of setting.split(',').filter(e => e.trim())) {
    const [guildId, name] = entry.split(':').map(part => part.trim());
    const dataCentre = DATA_CENTRE_NAMES.find(dc => dc === name);
    if (guildId && dataCentre) sources[guildId] = dataCentre;
    else console.error(`Relays: hunt source "${entry}" isn't <id>:<DC>`);
  }
  return sources;
}

// A picture of its own (an embed's image or an attached one), not only a
// thumbnail: the Fashion Report's infographic.
function hasPicture(message: RelayMessage) {
  return (
    message.embeds.some(embed => embed.image) ||
    message.attachments.some(file => file.contentType?.startsWith('image/'))
  );
}

// Relays channels of the Everise Discord to the site: every few minutes
// (the Worker's cron trigger) it reads each channel's latest messages and
// keeps the ones the site shows, as they are, with their Discord pictures
// copied (their links expire). An edited message is kept again; one deleted
// in Discord, or past its time, is deleted. Messages it doesn't show (from
// another server, a hunt group with no data centre) are logged and passed.
class RelaySync {
  constructor(
    private readonly db: Db,
    private readonly discord: DiscordChannel,
    private readonly images: RelayImages,
    private readonly settings: RelaySettings,
    private readonly now: () => Date,
  ) {}

  // Never fails: a channel that can't be read is logged, and read again
  // next time.
  async sync() {
    if (!this.discord.available) return;
    const channels: [RelayChannel, string | undefined][] = [
      ['weekly', this.settings.weeklyChannelId],
      ['hunts', this.settings.huntsChannelId],
    ];
    for (const [channel, channelId] of channels) {
      if (!channelId) continue;
      try {
        await this.syncChannel(channel, channelId);
      } catch (error) {
        console.error(`Relays: reading the ${channel} channel failed`, error);
      }
    }
  }

  private async syncChannel(channel: RelayChannel, channelId: string) {
    const messages = await this.discord.latest(channelId);
    const stored = await this.db.find<RelayedPostDoc>(RELAYED_POSTS, {
      where: [{field: 'channel', op: '==', value: channel}],
    });
    // Every message kept, as it is now: a picture they share isn't deleted.
    const kept = new Map(stored.map(doc => [doc.id, doc.message]));
    const cursor = await this.db.get<RelayCursorDoc>(RELAY_CURSORS, channel);
    const keptFrom = this.now().getTime() - KEPT_MS[channel];
    let lastId = cursor?.lastId;
    let handled = 0;
    const dropped = new Set<string>();
    for (const message of messages) {
      // A message is looked at once, and again only when one kept is edited.
      const before = kept.get(message.id);
      const seen = before
        ? before.editedAt === message.editedAt
        : !isNewer(message.id, cursor?.lastId);
      if (seen) continue;
      const place =
        Date.parse(message.postedAt) >= keptFrom
          ? this.placeOf(channel, message)
          : undefined;
      if (place) {
        if (handled++ === MAX_PER_READ) break;
        await this.keep(channel, place, message, before);
        kept.set(message.id, message);
        // An edit may have dropped a picture.
        if (before) await this.images.delete([before], [...kept.values()]);
      } else if (before) {
        dropped.add(message.id);
      }
      if (isNewer(message.id, lastId)) lastId = message.id;
    }
    // Deleted in Discord: no longer among the messages read, though newer
    // than the oldest of them.
    const read = new Set(messages.map(message => message.id));
    const oldestRead = messages[0]?.id;
    const deleted = stored.filter(
      doc =>
        dropped.has(doc.id) ||
        (!!oldestRead && !isNewer(oldestRead, doc.id) && !read.has(doc.id)),
    );
    // No history: only what the site shows now is kept.
    const current = await this.db.find<RelayedPostDoc>(RELAYED_POSTS, {
      where: [{field: 'channel', op: '==', value: channel}],
    });
    const gone = [
      ...deleted,
      ...outdated(
        current.filter(doc => !deleted.some(d => d.id === doc.id)),
        this.now(),
      ),
    ];
    for (const doc of gone) kept.delete(doc.id);
    await this.delete(gone, [...kept.values()]);
    if (lastId && lastId !== cursor?.lastId) {
      await this.db.set(RELAY_CURSORS, channel, {lastId});
    }
  }

  // Where a message goes on the site, or undefined when it isn't shown.
  private placeOf(
    channel: RelayChannel,
    message: RelayMessage,
  ): {kind: RelayKind; dataCentre?: DataCentre} | undefined {
    const source = message.sourceGuildId ?? '';
    if (channel === 'hunts') {
      // Only messages from followed channels, not members' own.
      const sources = this.settings.huntSources;
      const dataCentre =
        source &&
        trainDataCentre(
          message,
          sources[message.sourceChannelId ?? ''] ?? sources[source],
        );
      if (dataCentre) return {kind: 'hunt', dataCentre};
    } else if (source === FASHION_REPORT_SOURCE && hasPicture(message)) {
      return {kind: 'fashion-report'};
    } else if (
      source === ISLAND_SANCTUARY_SOURCE &&
      message.embeds.some(embed => embed.fields.length)
    ) {
      return {kind: 'island-sanctuary'};
    }
    console.log(
      `Relays: ${message.id} from ${message.sourceName} (channel ${message.sourceChannelId ?? '-'}, server ${source || 'this one'}) isn't shown`,
    );
    return undefined;
  }

  private async keep(
    channel: RelayChannel,
    place: {kind: RelayKind; dataCentre?: DataCentre},
    message: RelayMessage,
    before: RelayMessage | undefined,
  ) {
    await this.images.copy(message, before, place.kind === 'fashion-report');
    await this.db.set(RELAYED_POSTS, message.id, {
      channel,
      ...place,
      postedAt: new Date(message.postedAt),
      ...(place.kind === 'hunt' && {startsAt: trainStartsAt(message)}),
      message,
    });
  }

  // Pictures first, so a document never names a missing file; those of
  // `kept` messages stay.
  private async delete(docs: RelayedPostDoc[], kept: RelayMessage[]) {
    if (!docs.length) return;
    await this.images.delete(
      docs.map(doc => doc.message),
      kept,
    );
    await this.db.batch(
      docs.map((doc): Write => ({
        op: 'delete',
        collection: RELAYED_POSTS,
        id: doc.id,
      })),
    );
  }
}

export {RelaySettings, RelaySync, huntSources};
