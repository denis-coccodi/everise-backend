import {z} from 'zod';
import {responseSchema} from '../api';

// An upload: its address goes into a post's or comment's attachments.
const MediaResponse = responseSchema(
  'MediaResponse',
  z.strictObject({
    media: z.strictObject({
      id: z.string(),
      url: z.string(),
      contentType: z.string(),
      width: z.number().int(),
      height: z.number().int(),
    }),
  }),
);

const GifsAvailableResponse = responseSchema(
  'GifsAvailableResponse',
  z.strictObject({available: z.boolean()}),
);

const GifsQuery = z.object({
  // Search words; trending GIFs without them.
  q: z.string().max(100).default(''),
  // The previous page's `next`.
  offset: z.coerce.number().int().min(0).max(4999).default(0),
});

const GifsResponse = responseSchema(
  'GifsResponse',
  z.strictObject({
    gifs: z.array(
      z.strictObject({
        id: z.string(),
        title: z.string(),
        previewUrl: z.string(),
        url: z.string(),
        width: z.number(),
        height: z.number(),
      }),
    ),
    // The next page's offset; null on the last page.
    next: z.number().int().nullable(),
  }),
);

export {GifsAvailableResponse, GifsQuery, GifsResponse, MediaResponse};
