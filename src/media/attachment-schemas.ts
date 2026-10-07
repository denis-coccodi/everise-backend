import {z} from 'zod';
import {requestSchema, responseSchema} from '../api';

// An attachment as the site sends it. The server works out the rest (a
// video's id, whether an image is an upload): see cleanAttachment.
const NewAttachment = requestSchema(
  'NewAttachment',
  z.object({
    kind: z.enum(['image', 'gif', 'video'], {
      error: issue =>
        issue.input === undefined
          ? undefined
          : 'An attachment is an image, a GIF or a video.',
    }),
    url: z
      .url({protocol: /^https?$/, error: 'An attachment needs a web address.'})
      .max(2000),
    // What it shows, for people who can't see it.
    alt: z.string().max(200).optional(),
    width: z.number().int().min(1).max(10000).optional(),
    height: z.number().int().min(1).max(10000).optional(),
  }),
);

// Up to `max` attachments, for "A post" or "A comment".
function newAttachments(max: number, what: string) {
  const things = max === 1 ? 'image, GIF or video' : 'images, GIFs or videos';
  return z
    .array(NewAttachment)
    .max(max, {error: `${what} can have at most ${max} ${things}.`})
    .optional();
}

// An image, GIF or YouTube video shown apart from a post's or comment's text.
const AttachmentSchema = responseSchema(
  'Attachment',
  z.union([
    z.strictObject({
      kind: z.enum(['image', 'gif']),
      // An upload (this site's /api/media/:id), a GIPHY GIF, or any https
      // image.
      url: z.string(),
      alt: z.string().optional(),
      // Its size, when known, so the page keeps its space while it loads.
      width: z.number().int().optional(),
      height: z.number().int().optional(),
    }),
    z.strictObject({
      kind: z.literal('video'),
      // A plain YouTube watch link.
      url: z.string(),
      videoId: z.string(),
      // Where it starts, in seconds.
      start: z.number().int().optional(),
      alt: z.string().optional(),
    }),
  ]),
);

export {AttachmentSchema, newAttachments};
