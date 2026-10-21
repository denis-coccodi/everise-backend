import {z} from 'zod';
import {responseSchema} from '../api';

// Whether the site shows demo content, and how much: the site labels it so
// nobody takes it for real members.
const DemoContentResponse = responseSchema(
  'DemoContentResponse',
  z.strictObject({
    demoContent: z.strictObject({
      active: z.boolean(),
      members: z.number().int(),
      posts: z.number().int(),
      comments: z.number().int(),
    }),
  }),
);

export {DemoContentResponse};
