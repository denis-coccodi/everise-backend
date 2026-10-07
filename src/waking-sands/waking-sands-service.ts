import {Db, Doc} from '../db';
import {NotFoundError, TooManyRequestsError} from '../errors';
import {LiveFeed} from '../live/live-feed';
import {User} from '../users';
import {
  CharacterModel,
  ModelMessage,
  secondsToMidnightUtc,
} from './character-model';
import {CharacterProfile, CharactersService} from './characters-service';

// A line in the room as the site shows it. `from` is "member", "note" (who
// came and went), or the id of the character who said it.
interface RoomLine {
  id: string;
  at: string;
  from: string;
  name: string;
  image?: string;
  // The member's id, on a member's line.
  memberId?: string;
  text: string;
}

interface LineDoc extends Doc {
  // When it was said (ms), for the order and the day's history.
  at: number;
  from: string;
  name: string;
  image?: string;
  userId?: string;
  text: string;
}

// The room's state: who's in it, and until when someone's round of answers
// is running (ms; it's renewed every turn, so a stuck round frees it).
interface RoomDoc extends Doc {
  present?: string[];
  busyUntil?: number;
}

// The Neurons the day's replies (UTC) cost, all members' and each member's.
interface UsageDoc extends Doc {
  neurons?: number;
  members?: Record<string, number>;
}

// A member may spend this share of the site's daily Neurons, so a few
// keen talkers can't close the Waking Sands for everyone.
const MEMBER_SHARE = 1 / 4;
// After a member's line each character may speak this many times, answering
// the member or each other, before the room waits for a member again.
const TURNS_EACH = 2;
// What the room keeps: the last day, and at most this many lines.
const HISTORY_MS = 24 * 60 * 60 * 1000;
const MAX_LINES = 200;
// What the model sees of the conversation: the latest lines only. Most of a
// line's cost is reading them, so fewer lines mean cheaper answers.
const PROMPT_LINES = 8;
const MAX_REPLY_LENGTH = 1500;
const BUSY_MS = 90 * 1000;
// Members who write while a round runs are answered by the next rounds, at
// most this many per request.
const MAX_ROUNDS = 3;
const ROOM = 'room';
// At most this many characters in the room at once.
const MAX_PRESENT = 3;

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
    const present = await this.present();
    if (present.includes(id)) return present;
    if (present.length >= MAX_PRESENT) {
      throw new RangeError(
        `The room is full: at most ${MAX_PRESENT} characters at once. Send someone out first.`,
      );
    }
    return this.setPresent(
      [...present, id],
      `${member.username} invited ${character.name} in.`,
    );
  }

  async dismiss(member: User, id: string) {
    const character = await this.charactersService.get(id);
    const present = await this.present();
    if (!present.includes(id)) {
      throw new NotFoundError('character in the room');
    }
    return this.setPresent(
      present.filter(other => other !== id),
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
    if (await this.busy()) return line;

    await this.setBusy(true);
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
      await this.setBusy(false);
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
        await this.setBusy(true);
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

  private async setPresent(present: string[], note: string) {
    const room = await this.roomDoc();
    await this.db.set(this.rooms, ROOM, {
      present,
      busyUntil: room?.busyUntil ?? 0,
    });
    await this.publish({type: 'sands-presence', present});
    await this.addLine({from: 'note', name: '', text: note});
    return present;
  }

  private async busy() {
    return ((await this.roomDoc())?.busyUntil ?? 0) > this.now().getTime();
  }

  private async setBusy(busy: boolean) {
    const room = await this.roomDoc();
    await this.db.set(this.rooms, ROOM, {
      present: room?.present ?? [],
      busyUntil: busy ? this.now().getTime() + BUSY_MS : 0,
    });
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

function toLine(doc: LineDoc): RoomLine {
  return {
    id: doc.id,
    at: new Date(doc.at).toISOString(),
    from: doc.from,
    name: doc.name,
    ...(doc.image ? {image: doc.image} : {}),
    ...(doc.userId ? {memberId: doc.userId} : {}),
    text: doc.text,
  };
}

// The UTC day, as the usage document's id.
function day(now: Date) {
  return now.toISOString().slice(0, 10);
}

// The latest lines as a script ("Name: text"), notes in brackets.
function script(lines: LineDoc[]) {
  return lines
    .slice(-PROMPT_LINES)
    .map(line =>
      line.from === 'note' ? `(${line.text})` : `${line.name}: ${line.text}`,
    )
    .join('\n');
}

// The members who spoke in the lines the model sees.
function membersIn(lines: LineDoc[]) {
  return [
    ...new Set(
      lines
        .slice(-PROMPT_LINES)
        .filter(line => line.from === 'member')
        .map(line => line.name),
    ),
  ];
}

// What the director is asked: who of the characters present speaks next.
function direction(
  present: CharacterProfile[],
  free: CharacterProfile[],
  lines: LineDoc[],
  mustAnswer: boolean,
): ModelMessage[] {
  const cast = present.map(c => `- ${c.name}: ${c.title}`).join('\n');
  const quiet = present.filter(c => !free.includes(c)).map(c => c.name);
  const choices = free.map(c => c.name).join(', ');
  const system = `You direct a group chat at the Waking Sands between members of Everise, a FINAL FANTASY XIV free company, and these characters:
${cast}
Decide who speaks next. A character speaks when it's natural for them: they were addressed or mentioned, the topic is theirs, or they'd react to what someone just said, another character included.
${
  mustAnswer
    ? "Someone must answer the member's latest line: pick the character who fits it best."
    : 'If the conversation has reached a natural pause, or nobody has a real reason to speak, answer NONE. Prefer NONE to dragging it out.'
}${quiet.length ? `\n${quiet.join(', ')} can't speak again now.` : ''}
Answer with one name only, from: ${choices}${mustAnswer ? '' : ', or NONE'}.`;
  return [
    {role: 'system', content: system},
    {role: 'user', content: script(lines) || '(The room is quiet.)'},
  ];
}

// What the model is told for `character`'s next line: who they are, who's
// there, then the conversation, the character's own lines as its answers
// and everyone else's (named) as what it hears.
function prompt(
  character: CharacterProfile,
  present: CharacterProfile[],
  everyone: CharacterProfile[],
  lines: LineDoc[],
): ModelMessage[] {
  const recent = lines.slice(-PROMPT_LINES);
  const members = membersIn(recent);
  const others = present
    .filter(other => other.id !== character.id)
    .map(other => other.name);
  const company = [...members, ...others].join(', ') || 'whoever walks in';
  const system = `${character.persona}

The scene: you are chatting at the Waking Sands with ${company}. The members (${
    members.join(', ') || 'nobody yet'
  }) belong to Everise, a free company (player guild) on FINAL FANTASY XIV, and talk to you through its website; the others are characters like you.
How to answer:
- Write only ${
    character.name
  }'s next line: one to four short sentences, in the first person, as spoken words. Never write lines or actions for anyone else.
- Answer whoever spoke to you, or react to what was just said, members and other characters alike.
- Stay in character and in Eorzea. If asked for something from outside the game's world, answer in character and steer back.
- Swear only if your description above says you do. Whatever it says: no slurs, never mock anyone for who they are (origin, religion, gender, sexuality, disability), nothing sexual and nothing that encourages real harm. Banter, not bullying.
- Don't spoil the story past A Realm Reborn unless a member brings it up first.
- If someone sincerely asks whether you are an AI, say cheerfully that you are the site's AI-voiced ${
    character.name
  }.`;

  const messages: ModelMessage[] = [{role: 'system', content: system}];
  for (const line of recent) {
    if (line.from === 'note') continue;
    const speaker =
      line.from === 'member'
        ? line.name
        : (everyone.find(other => other.id === line.from)?.name ?? line.name);
    const message: ModelMessage =
      line.from === character.id
        ? {role: 'assistant', content: line.text}
        : {role: 'user', content: `${speaker}: ${line.text}`};
    // Chat models expect turns to alternate: lines in a row from the same
    // side go into one message.
    const last = messages[messages.length - 1];
    if (last.role === message.role) {
      last.content += `\n${message.content}`;
    } else {
      messages.push(message);
    }
  }
  // ...and to start with the other side: when the history the model sees
  // opens with the character's own line, someone walks in first.
  if (messages[1]?.role === 'assistant') {
    messages.splice(1, 0, {role: 'user', content: '(Someone walks in.)'});
  }
  // ...and to end with something to answer.
  if (messages[messages.length - 1].role !== 'user') {
    messages.push({role: 'user', content: '(The room waits for you.)'});
  }
  return messages;
}

// The model's line without a "Tataru:" (or "Barnaby:") it may have written
// before it, and not too long.
function clean(text: string, character: CharacterProfile) {
  const names = [character.name, character.name.split(' ')[0]].map(name =>
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const unnamed = text
    .replace(new RegExp(`^\\**(${names.join('|')})\\**\\s*:\\**\\s*`, 'i'), '')
    .trim();
  return unnamed.length > MAX_REPLY_LENGTH
    ? `${unnamed.slice(0, MAX_REPLY_LENGTH).trimEnd()}…`
    : unnamed;
}

export {MAX_PRESENT, MEMBER_SHARE, RoomLine, TURNS_EACH, WakingSandsService};
