import {Db, Doc} from '../db';
import {NotFoundError, TooManyRequestsError} from '../errors';
import {LiveFeed} from '../live/live-feed';
import {User} from '../users';
import {CharacterModel, secondsToMidnightUtc} from './character-model';
import {CharacterProfile, CharactersService} from './characters-service';
import {LineDoc, RoomDoc, RoomLine, UsageDoc} from './sands-docs';
import {
  MAX_PRESENT,
  MEMBER_SHARE,
  TURNS_EACH,
  clean,
  day,
  direction,
  prompt,
  toLine,
} from './room-prompts';

// What the room keeps: the last day, and at most this many lines.
const HISTORY_MS = 24 * 60 * 60 * 1000;
const MAX_LINES = 200;
const BUSY_MS = 90 * 1000;
// Members who write while a round runs are answered by the next rounds, at
// most this many per request.
const MAX_ROUNDS = 3;
const ROOM = 'room';

// The Waking Sands: one room every member shares. Members bring characters
// in or send them off, and talk; after each member's line the characters
// answer as they see fit: at least one, each at most twice, answering
// each other too. A short "director" call to the model picks who speaks next.
// Everything said is pushed live to everyone on the page.
class WakingSandsService {
  private readonly lines = 'sandsLines';
  private readonly rooms = 'sandsRoom';
  private readonly usage = 'chatUsage';

  constructor(
    private readonly db: Db,
    private readonly model: CharacterModel | undefined,
    private readonly charactersService: CharactersService,
    private readonly liveFeed: LiveFeed,
    private readonly now: () => Date,
    // The Neurons this backend may spend a day (WAKING_SANDS_DAILY_NEURONS).
    // Staging and production share the account's free 10,000, so together
    // they must stay under them.
    private readonly dailyNeurons: number,
  ) {}

  get available() {
    return !!this.model && this.dailyNeurons > 0;
  }

  // Everything the page needs: the characters, who's here, the day's lines.
  async room() {
    const characters = (await this.charactersService.all()).map(c => ({
      id: c.id,
      name: c.name,
      title: c.title,
      image: c.image,
    }));
    return {
      available: this.available,
      characters,
      present: await this.present(),
      lines: (await this.history()).map(toLine),
    };
  }

  async invite(member: User, id: string) {
    const character = await this.charactersService.get(id);
    const before = await this.present();
    if (before.includes(id)) return before;
    // Added in one step, up to MAX_PRESENT: invitations at once can't
    // overfill the room or undo each other.
    const room = await this.db.addToSet<RoomDoc>(
      this.rooms,
      ROOM,
      'present',
      id,
      {
        max: MAX_PRESENT,
        create: true,
      },
    );
    const present = room?.present ?? [];
    if (!present.includes(id)) {
      throw new RangeError(
        `The room is full: at most ${MAX_PRESENT} characters at once. Send someone out first.`,
      );
    }
    return this.announcePresent(
      present,
      `${member.username} invited ${character.name} in.`,
    );
  }

  async dismiss(member: User, id: string) {
    const character = await this.charactersService.get(id);
    if (!(await this.present()).includes(id)) {
      throw new NotFoundError('character in the room');
    }
    const room = await this.db.removeFromSet<RoomDoc>(
      this.rooms,
      ROOM,
      'present',
      id,
    );
    return this.announcePresent(
      room?.present ?? [],
      `${character.name} leaves; ${member.username} saw them out.`,
    );
  }

  // A member's line, and the characters' answers. If a round is already
  // running, it answers this line too, and this request returns at once.
  async say(member: User, text: string) {
    await this.checkBudget(member.id);
    const line = await this.addLine({
      from: 'member',
      name: member.username,
      image: member.image,
      userId: member.id,
      text,
    });
    // One round at a time: whoever takes the lease runs it, and it answers
    // lines that arrive meanwhile too.
    const now = this.now().getTime();
    const started = await this.db.takeLease(
      this.rooms,
      ROOM,
      'busyUntil',
      now,
      now + BUSY_MS,
    );
    if (!started) return line;

    try {
      let handled = 0;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const latest = (await this.history())
          .filter(doc => doc.from === 'member')
          .pop();
        if (!latest || latest.at <= handled) break;
        handled = latest.at;
        await this.round(latest.userId ?? member.id);
      }
    } finally {
      await this.db.update(this.rooms, ROOM, {busyUntil: 0});
      await this.publish({type: 'sands-writing', character: null});
    }
    return line;
  }

  // The characters' answers to the latest lines: someone always answers;
  // then whoever the director picks, until a pause or everyone has spoken
  // TURNS_EACH times. Its Neurons are charged to `payer`.
  private async round(payer: string) {
    const everyone = await this.charactersService.all();
    const present = (await this.present())
      .map(id => everyone.find(character => character.id === id))
      .filter((character): character is CharacterProfile => !!character);
    if (!this.model || present.length === 0) return;

    const turns = new Map<string, number>();
    for (let turn = 0; ; turn++) {
      const free = present.filter(c => (turns.get(c.id) ?? 0) < TURNS_EACH);
      // Alone, a character answers once: there's nobody to talk back to.
      if (free.length === 0 || (present.length === 1 && turn > 0)) break;
      try {
        await this.checkBudget(payer);
      } catch {
        break;
      }
      const lines = await this.history();
      try {
        const speaker =
          free.length === 1 && turn === 0
            ? free[0]
            : await this.direct(payer, lines, present, free, turn === 0);
        if (!speaker) break;
        await this.publish({type: 'sands-writing', character: speaker.id});
        // Still running: the lease lasts another BUSY_MS.
        await this.db.update(this.rooms, ROOM, {
          busyUntil: this.now().getTime() + BUSY_MS,
        });
        const {text, neurons} = await this.model.reply(
          prompt(speaker, present, everyone, lines),
        );
        await this.spend(payer, neurons);
        await this.addLine({
          from: speaker.id,
          name: speaker.name,
          image: speaker.image,
          text: clean(text, speaker),
        });
        turns.set(speaker.id, (turns.get(speaker.id) ?? 0) + 1);
      } catch (err) {
        console.error('Waking Sands round failed', err);
        await this.addLine({
          from: 'note',
          name: '',
          text: 'The room falls quiet: nobody could answer just now.',
        });
        break;
      }
    }
  }

  // Who speaks next, or undefined for a pause. First answers to a member
  // are never skipped.
  private async direct(
    payer: string,
    lines: LineDoc[],
    present: CharacterProfile[],
    free: CharacterProfile[],
    mustAnswer: boolean,
  ) {
    const {text, neurons} = await this.model!.reply(
      direction(present, free, lines, mustAnswer),
    );
    await this.spend(payer, neurons);
    const answer = text.toLowerCase();
    const named = free.find(
      c =>
        answer.includes(c.name.toLowerCase()) ||
        answer.includes(c.name.split(' ')[0].toLowerCase()),
    );
    if (named || !mustAnswer) return named;
    // The director said nothing usable: whoever the member named, or anyone.
    const last = lines[lines.length - 1]?.text.toLowerCase() ?? '';
    return (
      free.find(c => last.includes(c.name.split(' ')[0].toLowerCase())) ??
      free[Math.floor(Math.random() * free.length)]
    );
  }

  // A new line, always after the last one: two lines in the same
  // millisecond would otherwise come back in any order.
  private async addLine(line: Omit<LineDoc, keyof Doc | 'at'>) {
    const all = await this.db.find<LineDoc>(this.lines);
    const last = Math.max(0, ...all.map(doc => doc.at));
    const at = Math.max(this.now().getTime(), last + 1);
    const doc = await this.db.create<LineDoc>(this.lines, {...line, at});
    await this.publish({type: 'sands-line', line: toLine(doc)});
    await this.prune(at, [...all, doc]);
    return toLine(doc);
  }

  // The day's lines, oldest first, at most MAX_LINES.
  private async history() {
    const since = this.now().getTime() - HISTORY_MS;
    return (await this.db.find<LineDoc>(this.lines))
      .filter(doc => doc.at > since)
      .sort((a, b) => a.at - b.at)
      .slice(-MAX_LINES);
  }

  private async prune(now: number, lines: LineDoc[]) {
    const all = [...lines].sort((a, b) => b.at - a.at);
    const old = all.filter(
      (doc, index) => doc.at <= now - HISTORY_MS || index >= MAX_LINES,
    );
    if (old.length > 0) {
      await this.db.batch(
        old.map(doc => ({op: 'delete', collection: this.lines, id: doc.id})),
      );
    }
  }

  private async roomDoc() {
    return (await this.db.get<RoomDoc>(this.rooms, ROOM)) ?? undefined;
  }

  private async present() {
    return (await this.roomDoc())?.present ?? [];
  }

  private async announcePresent(present: string[], note: string) {
    await this.publish({type: 'sands-presence', present});
    await this.addLine({from: 'note', name: '', text: note});
    return present;
  }

  // A live update; a hub that's down never fails the conversation.
  private async publish(event: Parameters<LiveFeed['publish']>[0]) {
    try {
      await this.liveFeed.publish(event);
    } catch (err) {
      console.error('Live update failed', err);
    }
  }

  // Refuses once the member's or the site's Neurons for the day are spent.
  // A reply costs a few, so the last one may go a little over.
  private async checkBudget(memberId: string) {
    const now = this.now();
    const usage = await this.usageOf(now);
    const mine = usage.members?.[memberId] ?? 0;
    if ((usage.neurons ?? 0) >= this.dailyNeurons) {
      throw new TooManyRequestsError(
        'The Waking Sands is closed for the rest of the day. Come back after midnight UTC!',
        secondsToMidnightUtc(now),
      );
    }
    if (mine >= this.dailyNeurons * MEMBER_SHARE) {
      throw new TooManyRequestsError(
        "You've talked a great deal today, and the Scions need their rest too. Come back after midnight UTC!",
        secondsToMidnightUtc(now),
      );
    }
  }

  private async spend(memberId: string, neurons: number) {
    // Added in one step, so rounds ending together all count.
    await this.db.increment(this.usage, day(this.now()), {
      neurons,
      [`members.${memberId}`]: neurons,
    });
  }

  private async usageOf(now: Date): Promise<Partial<UsageDoc>> {
    return (await this.db.get<UsageDoc>(this.usage, day(now))) ?? {};
  }
}

export {MAX_PRESENT, MEMBER_SHARE, RoomLine, TURNS_EACH, WakingSandsService};
