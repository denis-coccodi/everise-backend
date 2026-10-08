import {z} from 'zod';
import {requestSchema} from '../api';
import {MAX_COMMENT_LENGTH} from './roulette-posts-service';

// What the reels landed on, as the frontend sends it. The card itself is
// built by the backend from its own duty data.
const NewRouletteResult = requestSchema(
  'NewRouletteResult',
  z.object({
    result: z.object({
      // The first reel: a duty group's name, or one of the picked types.
      type: z.string().min(1).max(100),
      // The second reel: a duty or a roulette, by id.
      candidate: z.object({
        kind: z.enum(['duty', 'roulette']),
        id: z.number().int().min(0),
      }),
      // The third reel.
      mode: z.string().min(1).max(100),
      // The job dealt by "dealer's choice".
      jobId: z.number().int().min(0).optional(),
    }),
    // Signed-in people only.
    comment: z
      .string()
      .max(MAX_COMMENT_LENGTH, {
        error: `Keep the comment to ${MAX_COMMENT_LENGTH} characters.`,
      })
      .optional(),
    // Also announce it in the Everise Discord. Signed-in people only:
    // Tataru's posts for guests stay on the site.
    shareToDiscord: z.boolean().optional(),
  }),
);

export {NewRouletteResult};
