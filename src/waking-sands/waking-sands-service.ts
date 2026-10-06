import {Db, Doc} from '../db';
import {TooManyRequestsError} from '../errors';
import {TataruAccount, User} from '../users';
import {
  CharacterModel,
  ModelMessage,
  secondsToMidnightUtc,
} from './character-model';
import {CHARACTERS, Character, characterById} from './characters';

// A line of the conversation as the site sends it: `from` is "member" or
// a character's id.
interface ChatLine {
  from: string;
  text: string;
}

interface Reply {
  character: string;
  text: string;
}

// The day's replies (UTC), all members' and each member's.
interface UsageDoc extends Doc {
  total: number;
  members: Record<string, number>;
}

// Per member and for the whole site, so nobody can use up the day's free
// Neurons alone, and the site never goes past them.
const MEMBER_DAILY_REPLIES = 40;
const SITE_DAILY_REPLIES = 400;
// What the model sees of the conversation: the latest lines only.
const HISTORY_LINES = 12;
const MAX_REPLY_LENGTH = 1500;

// The conversations in the Waking Sands. The site keeps a conversation;
// each message sends its latest lines, and every character in it answers in
// turn, seeing what the others just said.
class WakingSandsService {
  private readonly collection = 'chatUsage';

  constructor(
    private readonly db: Db,
    private readonly model: CharacterModel | undefined,
    private readonly tataru: TataruAccount,
    private readonly now: () => Date
  ) {}

  get available() {
    return !!this.model;
  }

  // The characters with their pictures (Tataru's is her account's).
  async characters() {
    const tataru = await this.tataru.get();
    return CHARACTERS.map(character => ({
      id: character.id,
      name: character.name,
      title: character.title,
      image: character.id === 'tataru' ? tataru.image : undefined,
    }));
  }

  async reply(member: User, characterIds: string[], lines: ChatLine[]) {
    const characters = characterIds.map(id => characterById(id)!);
    const replies: Reply[] = [];
    for (const character of characters) {
      await this.count(member.id);
      const messages = prompt(character, characters, member, [
        ...lines,
        ...replies.map(reply => ({from: reply.character, text: reply.text})),
      ]);
      const text = clean(await this.model!.reply(messages), character);
      replies.push({character: character.id, text});
    }
    return replies;
  }

  // Counts one reply, or refuses it once a limit is reached.
  private async count(memberId: string) {
    const now = this.now();
    const day = now.toISOString().slice(0, 10);
    const usage = await this.db.get<UsageDoc>(this.collection, day);
    const total = usage?.total ?? 0;
    const members = usage?.members ?? {};
    const mine = members[memberId] ?? 0;
    if (mine >= MEMBER_DAILY_REPLIES) {
      throw new TooManyRequestsError(
        `You've had ${MEMBER_DAILY_REPLIES} replies today. The Scions need their rest too: come back after midnight UTC!`,
        secondsToMidnightUtc(now)
      );
    }
    if (total >= SITE_DAILY_REPLIES) {
      throw new TooManyRequestsError(
        'The Waking Sands is closed for the rest of the day. Come back after midnight UTC!',
        secondsToMidnightUtc(now)
      );
    }
    await this.db.set(this.collection, day, {
      total: total + 1,
      members: {...members, [memberId]: mine + 1},
    });
  }
}

// What the model is told for `character`'s next line: who they are, who's
// there, then the conversation, the character's own lines as its answers
// and everyone else's (named) as what it hears.
function prompt(
  character: Character,
  present: Character[],
  member: User,
  lines: ChatLine[]
): ModelMessage[] {
  const others = present
    .filter(other => other.id !== character.id)
    .map(other => other.name);
  const company = [member.username, ...others].join(', ');
  const system = `${character.persona}

The scene: you are chatting at the Waking Sands with ${company}. ${member.username} is a member of Everise, a free company (player guild) on FINAL FANTASY XIV, talking to you through its website.
How to answer:
- Write only ${character.name}'s next line: one to four short sentences, in the first person, as spoken words. Never write lines or actions for anyone else.
- Stay in character and in Eorzea. If asked for something from outside the game's world, answer in character and steer back.
- Keep it friendly and suitable for all ages.
- Don't spoil the story past A Realm Reborn unless ${member.username} brings it up first.
- If someone sincerely asks whether you are an AI, say cheerfully that you are the site's AI-voiced ${character.name}.`;

  const messages: ModelMessage[] = [{role: 'system', content: system}];
  for (const line of lines.slice(-HISTORY_LINES)) {
    const own = line.from === character.id;
    const speaker =
      line.from === 'member'
        ? member.username
        : characterById(line.from)?.name ?? line.from;
    const message: ModelMessage = own
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
    messages.splice(1, 0, {
      role: 'user',
      content: `${member.username} walks in.`,
    });
  }
  return messages;
}

// The model's line without a "Tataru:" it may have written before it, and
// not too long.
function clean(text: string, character: Character) {
  const unnamed = text
    .replace(new RegExp(`^\\**${character.name}\\**\\s*:\\**\\s*`, 'i'), '')
    .trim();
  return unnamed.length > MAX_REPLY_LENGTH
    ? `${unnamed.slice(0, MAX_REPLY_LENGTH).trimEnd()}…`
    : unnamed;
}

export {
  ChatLine,
  MEMBER_DAILY_REPLIES,
  Reply,
  SITE_DAILY_REPLIES,
  WakingSandsService,
};
