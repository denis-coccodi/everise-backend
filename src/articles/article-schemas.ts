import {z} from 'zod';
import {isoDate, requestSchema, responseSchema} from '../api';
import {
  MAX_COMMENT_ATTACHMENTS,
  MAX_POST_ATTACHMENTS,
} from '../media/attachments';
import {AttachmentSchema, newAttachments} from '../media/attachment-schemas';
import {PartyFinderIcons, PartyFinderListingSchema} from '../party-finder';
import {ProfileSchema} from '../profiles';

// A roulette result shown as a card, built by the backend from its own duty
// data (see RouletteCard in article.ts).
const RouletteCardSchema = responseSchema(
  'RouletteCard',
  z.strictObject({
    type: z.string(),
    name: z.string(),
    detail: z.string(),
    mode: z.string(),
    // A duty roulette: the game picks the duty.
    dutyUnknown: z.boolean(),
    // The duty's or roulette's banner, an id for GET /api/images/:id.
    image: z.number().int().nullable(),
    // The job dealt by "dealer's choice".
    job: z.strictObject({name: z.string(), icon: z.number().int()}).nullable(),
    // Posted by Tataru for someone who wasn't signed in.
    guest: z.boolean(),
  }),
);

// A Party Finder listing shared as a post: the listing as it was then (it
// ends within the hour), on its data centre, with the icons to show it.
const PartyFinderPostSchema = responseSchema(
  'PartyFinderPost',
  z.strictObject({
    dataCentre: z.string(),
    icons: PartyFinderIcons,
    listing: PartyFinderListingSchema,
  }),
);

const ArticleSchema = responseSchema(
  'Article',
  z.strictObject({
    // What identifies the post in links and API paths. Never its title.
    id: z.string(),
    // Only on posts from before ids were in links: what their old links used.
    slug: z.string().optional(),
    title: z.string(),
    description: z.string(),
    body: z.string(),
    tagList: z.array(z.string()),
    createdAt: isoDate,
    updatedAt: isoDate,
    // Whether the signed-in user favorited it.
    favorited: z.boolean(),
    favoritesCount: z.number().int(),
    media: z.array(AttachmentSchema),
    // Only on roulette results.
    roulette: RouletteCardSchema.optional(),
    // Only on shared Party Finder listings.
    partyFinder: PartyFinderPostSchema.optional(),
    author: ProfileSchema,
  }),
);

const ArticleResponse = responseSchema(
  'ArticleResponse',
  z.strictObject({article: ArticleSchema}),
);

const ArticlesResponse = responseSchema(
  'ArticlesResponse',
  z.strictObject({
    articles: z.array(ArticleSchema),
    // How many are on this page.
    articlesCount: z.number().int(),
  }),
);

const CommentSchema = responseSchema(
  'Comment',
  z.strictObject({
    id: z.string(),
    createdAt: isoDate,
    updatedAt: isoDate,
    body: z.string(),
    // An image, GIF or video, or null.
    media: AttachmentSchema.nullable(),
    author: ProfileSchema,
  }),
);

const CommentResponse = responseSchema(
  'CommentResponse',
  z.strictObject({comment: CommentSchema}),
);

const CommentsResponse = responseSchema(
  'CommentsResponse',
  z.strictObject({comments: z.array(CommentSchema)}),
);

const TagsResponse = responseSchema(
  'TagsResponse',
  z.strictObject({tags: z.array(z.string())}),
);

const text = () => z.string().min(1);

const NewArticle = requestSchema(
  'NewArticle',
  z.object({
    article: z.object({
      title: text(),
      description: text(),
      // May be empty when the post has attachments.
      body: z.string(),
      tagList: z.array(text()).optional(),
      media: newAttachments(MAX_POST_ATTACHMENTS, 'A post'),
    }),
    // Also announce it in the Everise Discord (only when asked).
    shareToDiscord: z.boolean().optional(),
  }),
);

// Only the fields being changed.
const ArticleUpdate = requestSchema(
  'ArticleUpdate',
  z.object({
    article: z.object({
      title: text().optional(),
      description: text().optional(),
      body: z.string().optional(),
      tagList: z.array(text()).optional(),
      media: newAttachments(MAX_POST_ATTACHMENTS, 'A post'),
    }),
  }),
);

const NewComment = requestSchema(
  'NewComment',
  z.object({
    comment: z.object({
      // May be empty when the comment has an attachment.
      body: z.string(),
      media: newAttachments(MAX_COMMENT_ATTACHMENTS, 'A comment'),
    }),
  }),
);

const page = {
  limit: z.coerce.number().int().default(20),
  offset: z.coerce.number().int().default(0),
};

const FeedQuery = z.object(page);

const ArticlesQuery = z.object({
  tag: text().optional(),
  // A member's id (or, from old links, their username).
  author: text().optional(),
  // Posts this member (id or username) favorited.
  favorited: text().optional(),
  ...page,
});

export {
  ArticleResponse,
  ArticlesQuery,
  ArticlesResponse,
  ArticleUpdate,
  CommentResponse,
  CommentsResponse,
  FeedQuery,
  NewArticle,
  NewComment,
  PartyFinderPostSchema,
  RouletteCardSchema,
  TagsResponse,
};
