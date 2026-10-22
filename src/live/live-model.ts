import {ArticleDto} from '../articles';
import {RoomLine} from '../waking-sands';

// A new post's event, and the post in it.
type ArticleEvent = Extract<LiveEvent, {type: 'article-created'}>;

// Events pushed to everyone connected to GET /api/live.
type LiveEvent =
  | {
      // A new post, as the API returns it to someone who isn't signed in
      // (favorited and author.following are false): nothing personal is ever
      // broadcast. Pages insert it into their lists as it is.
      type: 'article-created';
      article: ArticleDto['article'];
    }
  // The Waking Sands room: a new line (a member's, a character's or a note),
  // who's in the room now, and which character is writing (null: nobody).
  | {type: 'sands-line'; line: RoomLine}
  | {type: 'sands-presence'; present: string[]}
  | {type: 'sands-writing'; character: string | null};

export {ArticleEvent, LiveEvent};
