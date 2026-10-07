import {z} from 'zod';

// The named schemas the OpenAPI document lists under components.schemas, so
// the frontend gets one type per name. Responses are described as the JSON
// the API sends (dates as ISO strings); request bodies as what clients send.
const responseSchemas = z.registry<{id: string}>();
const requestSchemas = z.registry<{id: string}>();

// A response body, or a part of one other responses share. Build objects
// with z.strictObject: a field the API sends but the schema doesn't name
// then fails the response check the tests run.
function responseSchema<T extends z.ZodType>(id: string, schema: T): T {
  responseSchemas.add(schema, {id});
  return schema;
}

// A request body.
function requestSchema<T extends z.ZodType>(id: string, schema: T): T {
  requestSchemas.add(schema, {id});
  return schema;
}

// A date in a response (JSON turns Date objects into ISO strings).
const isoDate = z.iso.datetime();

// What every error answer looks like (see src/error-handler).
const ErrorResponse = responseSchema(
  'ErrorResponse',
  z.strictObject({
    errors: z.strictObject({body: z.array(z.string())}),
    // Only on a sign-in to an account whose email isn't confirmed yet.
    unconfirmedEmail: z.string().optional(),
  }),
);

export {ErrorResponse, isoDate, requestSchema, requestSchemas, responseSchema};
export {responseSchemas};
