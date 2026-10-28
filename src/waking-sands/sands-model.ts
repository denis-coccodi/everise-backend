import {Doc} from '../db';

// What the Waking Sands stores, and a line as the site shows it.

// A message for the model, in the usual chat form.
interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// A character's next line, and what writing it cost in Workers AI's
// Neurons (the free plan has 10,000 a day).
interface ModelReply {
  text: string;
  neurons: number;
}

// A character members can talk to in the Waking Sands, as the backend ships
// them. Each one is an AI model told who to be; the site says so next to the
// chat. Admins can change a character's title, personality and picture in
// the settings (CharactersService); these are the defaults.
// FINAL FANTASY XIV characters are Square Enix's: they appear here as
// non-commercial fan work.
interface Character {
  id: string;
  name: string;
  // A few words under the name in the picker.
  title: string;
  // Their profile's bio, as they'd write it (GET /api/profiles/character:<id>).
  bio: string;
  // Who they are and how they talk, for the model.
  persona: string;
  // Their picture in public/, served at /api/waking-sands/characters/:id/picture
  picture?: string;
  // Everise's own (Barnaby, Bernadette), not the game's: the picker lists
  // them apart.
  local?: boolean;
}

interface CharacterChanges {
  // An empty value goes back to the default.
  title?: string | null;
  persona?: string | null;
  bio?: string | null;
}

// What an admin changed about a character; unset fields keep the default.
interface CharacterDoc extends Doc {
  title?: string | null;
  persona?: string | null;
  bio?: string | null;
  // An uploaded picture's address (profileImages).
  image?: string | null;
}

// A character as the chat and the settings see it: the default with the
// admin's changes. `edited` says which fields differ from the default
// (`image`: an uploaded picture replaces the shipped one).
interface CharacterProfile {
  id: string;
  name: string;
  title: string;
  persona: string;
  defaultPersona: string;
  // Their profile's bio.
  bio: string;
  image?: string;
  edited: {title: boolean; persona: boolean; bio: boolean; image: boolean};
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

// The Neurons the day's replies (UTC) cost, all members' and each member's.
interface UsageDoc extends Doc {
  neurons?: number;
  members?: Record<string, number>;
}

export {
  Character,
  CharacterChanges,
  CharacterDoc,
  CharacterProfile,
  LineDoc,
  ModelMessage,
  ModelReply,
  RoomDoc,
  RoomLine,
  UsageDoc,
};
