import {Doc} from '../db';

// What the Waking Sands stores, and a line as the site shows it.

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

export {LineDoc, RoomDoc, RoomLine, UsageDoc};
