import slugify from 'slugify';
import {Doc} from '../db';
import {
  Attachment,
  attachmentsFromText,
  cleanAttachment,
  currentAttachment,
  uploadIdOf,
} from '../media/attachments';
import {Article, PartyFinderPost, RouletteCard} from './article';
import {Comment} from './comment';
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

function toArticle(doc: ArticleDoc): Article {
  // A post from before attachments shows its text's media as attachments,
  // like new posts; the stored post isn't changed.
  const {attachments, text} = doc.media
    ? {attachments: doc.media, text: doc.body}
    : attachmentsFromText(doc.body);
  return new Article(
    doc.id,
    doc.authorId,
    doc.slug,
    doc.title,
    doc.description,
    text,
    doc.tags,
    doc.favoritedBy,
    doc.createdAt,
    doc.updatedAt,
    doc.roulette,
    attachments.map(currentAttachment),
    doc.partyFinder,
  );
}

function toComment(doc: CommentDoc): Comment {
  return new Comment(
    doc.id,
    doc.articleId,
    doc.authorId,
    doc.body,
    doc.createdAt,
    doc.updatedAt,
    doc.media ? currentAttachment(doc.media) : null,
  );
}

// The site's own uploads among some attachments, by id.
function uploadsIn(media: Attachment[]): string[] {
  return media.flatMap(item => uploadIdOf(item) ?? []);
}

// Tags as stored: lowercase slugs, each once, sorted.
function tidyTags(tags: string[]) {
  return [...new Set(tags.map(tag => slugify(tag.toLowerCase())))].sort();
}

export {
  AttachmentInput,
  CreateArticleParams,
  ListArticlesParams,
  UserFeedParams,
  UpdateArticleParams,
  ListCommentsParams,
  ArticleDoc,
  CommentDoc,
  toArticle,
  toComment,
  tidyTags,
  uploadsIn,
};
