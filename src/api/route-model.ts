import {z} from 'zod';
import {AuthCheck} from '../middleware';

// One endpoint: what it takes and what it answers. route() checks requests
// against it and the OpenAPI document (/api/openapi.json) is built from it.
interface RouteSpec<
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType,
> {
  method: Method;
  // As Express writes it, under /api: '/articles/:id'.
  path: string;
  summary: string;
  // The group it is listed under; the path's first segment by default.
  tag?: string;
  auth?: AuthCheck;
  // Path parameters are strings without a schema.
  params?: P;
  // Query values arrive as strings: use z.coerce for numbers.
  query?: Q;
  body?: B;
  // How the body is sent: JSON, or a picture's bytes as they are (checked by
  // the handler, which reads them with readImageBody).
  bodyType?: 'json' | 'image';
  responses: Record<number, ResponseSpec>;
}
type Method = 'get' | 'post' | 'put' | 'delete';
interface ResponseSpec {
  description: string;
  // The JSON body, a schema from responseSchema(); none for an empty answer.
  schema?: z.ZodType;
  // A body other than JSON, e.g. 'image/*' for a picture.
  contentType?: string;
}

export {RouteSpec, Method, ResponseSpec};
