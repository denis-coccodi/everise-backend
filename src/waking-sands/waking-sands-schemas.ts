import {z} from 'zod';
import {isoDate, requestSchema, responseSchema} from '../api';
import {CHARACTERS} from './characters';

// How long a member's line may be.
const MAX_LINE_LENGTH = 1000;

const CharacterParams = z.object({
  id: z.string().refine(id => CHARACTERS.some(c => c.id === id), {
    error: 'There is no such character.',
  }),
});

// A line in the room.
const SandsLine = responseSchema(
  'SandsLine',
  z.strictObject({
    id: z.string(),
    at: isoDate,
    // "member", "note", or the id of the character who said it.
    from: z.string(),
    name: z.string(),
    image: z.string().optional(),
    // The member's id, on a member's line.
    memberId: z.string().optional(),
    text: z.string(),
  }),
);

const SandsRoom = responseSchema(
  'SandsRoom',
  z.strictObject({
    // False until the day's AI budget is set (WAKING_SANDS_DAILY_NEURONS).
    available: z.boolean(),
    characters: z.array(
      z.strictObject({
        id: z.string(),
        name: z.string(),
        title: z.string(),
        image: z.string().optional(),
      }),
    ),
    // The ids of the characters in the room.
    present: z.array(z.string()),
    // The day's lines, oldest first.
    lines: z.array(SandsLine),
    limits: z.strictObject({
      // How many characters can be in the room at once.
      maxPresent: z.number().int(),
      maxLineLength: z.number().int(),
    }),
  }),
);

const PresentResponse = responseSchema(
  'PresentResponse',
  z.strictObject({present: z.array(z.string())}),
);

const NewSandsLine = requestSchema(
  'NewSandsLine',
  z.object({text: z.string().trim().min(1).max(MAX_LINE_LENGTH)}),
);

const SandsLineResponse = responseSchema(
  'SandsLineResponse',
  z.strictObject({line: SandsLine}),
);

export {
  CharacterParams,
  MAX_LINE_LENGTH,
  NewSandsLine,
  PresentResponse,
  SandsLineResponse,
  SandsRoom,
};
