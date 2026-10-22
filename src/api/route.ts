import {Request, RequestHandler, Response, Router} from 'express';
import {z} from 'zod';
import {config} from '../config';
import {ValidationError} from '../errors';
import {defaultMessage, issueMessages} from './messages';
import {RouteSpec} from './route-model';

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

// Sends JSON that is already text (e.g. written by a Durable Object), so
// the Worker doesn't parse and write it again. When responses are checked
// it goes through res.json, so its schema is checked too.
function sendJsonText(res: Response, text: string) {
  if (config.checkApiResponses) res.json(JSON.parse(text));
  else res.type('json').send(text);
}

export {route, routeSpecs, sendJsonText};
