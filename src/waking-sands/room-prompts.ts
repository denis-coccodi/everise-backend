import {ModelMessage} from './character-model';
import {CharacterProfile} from './characters-service';
import {LineDoc, RoomLine} from './sands-docs';

// The Waking Sands' rules, and the text it sends the model: the prompts and
// what's kept of an answer.

// A member may spend this share of the site's daily Neurons, so a few
// keen talkers can't close the Waking Sands for everyone.
const MEMBER_SHARE = 1 / 4;
// After a member's line each character may speak this many times, answering
// the member or each other, before the room waits for a member again.
const TURNS_EACH = 2;
// What the model sees of the conversation: the latest lines only. Most of a
// line's cost is reading them, so fewer lines mean cheaper answers.
const PROMPT_LINES = 8;
const MAX_REPLY_LENGTH = 1500;
// At most this many characters in the room at once.
const MAX_PRESENT = 3;

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

export {
  MAX_PRESENT,
  MAX_REPLY_LENGTH,
  MEMBER_SHARE,
  PROMPT_LINES,
  TURNS_EACH,
  toLine,
  day,
  direction,
  prompt,
  clean,
};
