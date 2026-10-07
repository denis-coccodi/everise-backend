import {Request, RequestHandler, Router} from 'express';
import {z} from 'zod';
import {config} from '../config';
import {ValidationError} from '../errors';
import {AuthCheck} from '../middleware';
import {defaultMessage, issueMessages} from './messages';

type Method = 'get' | 'post' | 'put' | 'delete';

interface ResponseSpec {
  description: string;
  // The JSON body, a schema from responseSchema(); none for an empty answer.
  schema?: z.ZodType;
  // A body other than JSON, e.g. 'image/*' for a picture.
  contentType?: string;
}

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

type Output<T, Fallback> = T extends z.ZodType ? z.output<T> : Fallback;

// Every route defined so far, by method and path (the app may be built more
// than once, e.g. in tests; the last definition wins).
const routeSpecs = new Map<string, RouteSpec>();

// Adds an endpoint to the router: signs in the user when `auth` says so,
// parses params, query and body with their schemas (a 422 lists every field
// that failed), then runs the handlers with the parsed values typed.
function route<
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
>(
  router: Router,
  spec: RouteSpec<NonNullable<P>, NonNullable<Q>, NonNullable<B>> & {
    params?: P;
    query?: Q;
    body?: B;
  },
  ...handlers: RequestHandler<
    Output<P, Record<string, string>>,
    unknown,
    Output<B, unknown>,
    Output<Q, Request['query']>
  >[]
) {
  routeSpecs.set(`${spec.method} ${spec.path}`, spec as RouteSpec);
  const middleware: RequestHandler[] = [];
  if (config.checkApiResponses) middleware.push(checkResponses(spec));
  if (spec.auth) middleware.push(spec.auth.handler);
  middleware.push(validate(spec));
  router[spec.method](
    spec.path,
    ...middleware,
    ...(handlers as unknown as RequestHandler[]),
  );
}

function validate(spec: RouteSpec): RequestHandler {
  return (req, _res, next) => {
    const messages: string[] = [];
    const parse = (
      schema: z.ZodType | undefined,
      value: unknown,
      segment: string,
      use: (data: unknown) => void,
    ) => {
      if (!schema) return;
      const result = schema.safeParse(value, {error: defaultMessage});
      if (result.success) use(result.data);
      else messages.push(...issueMessages(result.error, segment));
    };

    parse(spec.params, req.params, 'params', data => {
      req.params = data as Record<string, string>;
    });
    // Express 5 computes req.query on each read; the parsed one replaces it.
    parse(spec.query, req.query, 'query', data => {
      Object.defineProperty(req, 'query', {value: data, writable: true});
    });
    parse(spec.body, req.body, 'body', data => {
      req.body = data;
    });

    if (messages.length > 0) throw new ValidationError(messages);
    next();
  };
}

// Fails (a 500 the tests see) when a JSON answer isn't one the route
// declares, or doesn't match its schema. Errors (4xx, 5xx) have their own
// shape, written by the error handler.
function checkResponses(spec: RouteSpec): RequestHandler {
  const name = `${spec.method.toUpperCase()} ${spec.path}`;
  return (_req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => {
      if (res.statusCode < 400) {
        const schema = spec.responses[res.statusCode]?.schema;
        if (!schema) {
          throw new Error(
            `${name} sent JSON with ${res.statusCode}, which it doesn't declare.`,
          );
        }
        const result = schema.safeParse(JSON.parse(JSON.stringify(body)));
        if (!result.success) {
          throw new Error(
            `${name} sent a ${res.statusCode} that doesn't match its schema:\n${z.prettifyError(result.error)}`,
          );
        }
      }
      return json(body);
    };
    next();
  };
}

export {RouteSpec, route, routeSpecs};
