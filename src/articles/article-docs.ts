import slugify from 'slugify';
import {
  Attachment,
  attachmentsFromText,
  currentAttachment,
  uploadIdOf,
} from '../media';
import {Article} from './article';
import {Comment} from './comment';
import {ArticleDoc, CommentDoc} from './article-model';

// Posts and comments to and from their stored documents (article-model.ts).

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

export {toArticle, toComment, tidyTags, uploadsIn};
