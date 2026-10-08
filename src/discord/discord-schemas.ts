import {z} from 'zod';
import {responseSchema} from '../api';

const DiscordWidgetResponse = responseSchema(
  'DiscordWidgetResponse',
  z.strictObject({
    // Null when the server's widget is off or Discord can't be reached.
    widget: z
      .strictObject({
        name: z.string(),
        // Who's online now.
        presenceCount: z.number().int(),
        members: z.array(
          z.strictObject({
            name: z.string(),
            avatarUrl: z.string(),
            status: z.string(),
          }),
        ),
      })
      .nullable(),
  }),
);

// Whether members can share in the Everise Discord (its webhook is set).
const DiscordSharingResponse = responseSchema(
  'DiscordSharingResponse',
  z.strictObject({available: z.boolean()}),
);

export {DiscordSharingResponse, DiscordWidgetResponse};
