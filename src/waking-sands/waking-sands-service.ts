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

// The Neurons the day's replies (UTC) cost, all members' and each member's.
interface UsageDoc extends Doc {
  neurons?: number;
  members?: Record<string, number>;
}

// A member may spend this share of the site's daily Neurons, so a few
// keen talkers can't close the Waking Sands for everyone.
const MEMBER_SHARE = 1 / 4;
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
    private readonly now: () => Date,
    // The Neurons this backend may spend a day (WAKING_SANDS_DAILY_NEURONS).
    // Staging and production share the account's free 10,000, so together
    // they must stay under them.
    private readonly dailyNeurons: number,
    private readonly siteUrl: string
  ) {}

  get available() {
    return !!this.model && this.dailyNeurons > 0;
  }

  // The characters with their pictures (Tataru's is her account's).
  async characters() {
    const tataru = await this.tataru.get();
    return CHARACTERS.map(character => ({
      id: character.id,
      name: character.name,
      title: character.title,
      image: character.picture
        ? `${this.siteUrl}/api/waking-sands/characters/${character.id}/picture`
        : character.id === 'tataru'
        ? tataru.image
        : undefined,
    }));
  }

  async reply(member: User, characterIds: string[], lines: ChatLine[]) {
    const characters = characterIds.map(id => characterById(id)!);
    const replies: Reply[] = [];
    for (const character of characters) {
      await this.checkBudget(member.id);
      const messages = prompt(character, characters, member, [
        ...lines,
        ...replies.map(reply => ({from: reply.character, text: reply.text})),
      ]);
      const {text, neurons} = await this.model!.reply(messages);
      await this.spend(member.id, neurons);
      replies.push({character: character.id, text: clean(text, character)});
    }
    return replies;
  }

  // Refuses the next reply once the member's or the site's Neurons for the
  // day are spent. A reply costs a few, so the last one may go a little over.
  private async checkBudget(memberId: string) {
    const now = this.now();
    const usage = await this.usage(now);
    const mine = usage.members?.[memberId] ?? 0;
    if ((usage.neurons ?? 0) >= this.dailyNeurons) {
      throw new TooManyRequestsError(
        'The Waking Sands is closed for the rest of the day. Come back after midnight UTC!',
        secondsToMidnightUtc(now)
      );
    }
    if (mine >= this.dailyNeurons * MEMBER_SHARE) {
      throw new TooManyRequestsError(
        "You've talked a great deal today, and the Scions need their rest too. Come back after midnight UTC!",
        secondsToMidnightUtc(now)
      );
    }
  }

  private async spend(memberId: string, neurons: number) {
    const now = this.now();
    const usage = await this.usage(now);
    const members = usage.members ?? {};
    await this.db.set(this.collection, day(now), {
      neurons: (usage.neurons ?? 0) + neurons,
      members: {...members, [memberId]: (members[memberId] ?? 0) + neurons},
    });
  }

  private async usage(now: Date): Promise<Partial<UsageDoc>> {
    return (await this.db.get<UsageDoc>(this.collection, day(now))) ?? {};
  }
}

// The UTC day, as the usage document's id.
function day(now: Date) {
  return now.toISOString().slice(0, 10);
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

export {ChatLine, MEMBER_SHARE, Reply, WakingSandsService};
