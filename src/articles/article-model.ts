import {cleanAttachment, Attachment} from '../media';
import {Doc} from '../db';
import {z} from 'zod';
import {PartyFinderPostSchema} from './article-schemas';

// Posts and comments as the database stores them, and the parameters the services take.

// What the site sends for an attachment; checked and tidied before saving.
type AttachmentInput = Parameters<typeof cleanAttachment>[0];

interface CreateArticleParams {
  title: string;
  description: string;
  body: string;
  tags?: string[];
  roulette?: RouletteCard;
  partyFinder?: PartyFinderPost;
  media?: AttachmentInput[];
  // Also announce it in the Everise Discord.
  shareToDiscord?: boolean;
}

interface ListArticlesParams {
  orderBy: {
    field: 'createdAt';
    direction: 'asc' | 'desc';
  }[];
  tag?: string;
  authorId?: string;
  favoritedByUserId?: string;
  limit?: number;
  offset?: number;
}

interface UserFeedParams {
  userId: string;
  limit?: number;
  offset?: number;
}

interface UpdateArticleParams {
  title?: string;
  description?: string;
  body?: string;
  tags?: string[];
  media?: AttachmentInput[];
}

interface ListCommentsParams {
  orderBy: {
    field: 'createdAt';
    direction: 'asc' | 'desc';
  }[];
  // The post's id (or an old link's slug).
  article?: string;
}

interface ArticleDoc extends Doc {
  authorId: string;
  // Only on posts made before they had ids in their links, to keep those
  // links working: a slug made from the title.
  slug?: string;
  title: string;
  description: string;
  body: string;
  tags: string[];
  favoritedBy: string[];
  roulette?: RouletteCard;
  partyFinder?: PartyFinderPost;
  // Unset on posts from before attachments: their media is in the text.
  media?: Attachment[];
}

interface CommentDoc extends Doc {
  articleId: string;
  authorId: string;
  body: string;
  media?: Attachment;
}

// A Party Finder listing shared as a post, as it was then.
type PartyFinderPost = z.infer<typeof PartyFinderPostSchema>;

// A roulette result shown as a card, like the roulette's "Duty Found"
// window. Built by the backend from its own duty data, never from the client.
interface RouletteCard {
  type: string;
  name: string;
  // Level, item level and expansion, or what a duty roulette covers.
  detail: string;
  // The party settings, e.g. "Everyone on the same job: Ninja".
  mode: string;
  // True for a duty roulette: the game picks the duty.
  dutyUnknown: boolean;
  // The duty's or roulette's banner, an id for GET /api/images/:id.
  image: number | null;
  // The job dealt by "dealer's choice".
  job: {name: string; icon: number} | null;
  // Posted by Tataru for someone who wasn't signed in.
  guest: boolean;
}

export {
  ArticleDoc,
  AttachmentInput,
  CommentDoc,
  CreateArticleParams,
  ListArticlesParams,
  ListCommentsParams,
  PartyFinderPost,
  RouletteCard,
  UpdateArticleParams,
  UserFeedParams,
};
