import {z} from 'zod';
import {RouteSpec, routeSpecs} from './route';
import {ErrorResponse, requestSchemas, responseSchemas} from './schemas';

type JsonSchema = Record<string, unknown>;

const uri = (id: string) => `#/components/schemas/${id}`;

// A named schema as a reference; every body schema must have a name, so the
// frontend gets a type for it.
function ref(schema: z.ZodType, registry: z.core.$ZodRegistry<{id: string}>) {
  const id = registry.get(schema)?.id;
  if (!id) {
    throw new Error('A request or response body needs a schema with a name.');
  }
  return {$ref: uri(id)};
}

// One schema on its own (a parameter), without the JSON Schema header.
function inline(schema: z.ZodType): JsonSchema {
  const {$schema, ...rest} = z.toJSONSchema(schema, {io: 'input'});
  void $schema;
  return rest;
}

function components(
  registry: z.core.$ZodRegistry<{id: string}>,
  io: 'input' | 'output',
) {
  const {schemas} = z.toJSONSchema(registry, {uri, io});
  return Object.fromEntries(
    Object.entries(schemas).map(([id, schema]) => {
      const {$schema, $id, ...rest} = schema;
      void $schema;
      void $id;
      return [id, rest];
    }),
  );
}

function objectShape(schema: z.ZodType | undefined) {
  return schema instanceof z.ZodObject
    ? (schema.shape as Record<string, z.ZodType>)
    : undefined;
}

function parameters(spec: RouteSpec) {
  const params = objectShape(spec.params);
  const names = [...spec.path.matchAll(/:(\w+)/g)].map(match => match[1]);
  const path = names.map(name => ({
    name,
    in: 'path',
    required: true,
    schema: params?.[name] ? inline(params[name]) : {type: 'string'},
  }));
  const query = Object.entries(objectShape(spec.query) ?? {}).map(
    ([name, schema]) => ({
      name,
      in: 'query',
      required: !schema.safeParse(undefined).success,
      schema: inline(schema),
    }),
  );
  return [...path, ...query];
}

function operation(spec: RouteSpec) {
  const responses: Record<string, unknown> = {};
  for (const [status, response] of Object.entries(spec.responses)) {
    const content = response.schema
      ? {'application/json': {schema: ref(response.schema, responseSchemas)}}
      : response.contentType
        ? {[response.contentType]: {schema: {type: 'string', format: 'binary'}}}
        : undefined;
    responses[status] = {description: response.description, content};
  }
  responses.default = {
    description: 'An error; `errors.body` says what went wrong.',
    content: {
      'application/json': {schema: ref(ErrorResponse, responseSchemas)},
    },
  };

  const bodyType =
    spec.bodyType === 'multipart' ? 'multipart/form-data' : 'application/json';
  return {
    tags: [spec.tag ?? spec.path.split('/')[1]],
    summary: spec.summary,
    security:
      spec.auth?.mode === 'required'
        ? [{token: []}]
        : spec.auth?.mode === 'optional'
          ? [{token: []}, {}]
          : undefined,
    parameters: parameters(spec),
    requestBody: spec.body && {
      required: !spec.body.safeParse(undefined).success,
      content: {[bodyType]: {schema: ref(spec.body, requestSchemas)}},
    },
    responses,
  };
}

// The OpenAPI 3.1 document of every route defined with route(): served at
// /api/openapi.json and kept in openapi.json for the frontend's types.
function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  const specs = [...routeSpecs.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  for (const spec of specs) {
    const path = '/api' + spec.path.replace(/:(\w+)/g, '{$1}');
    paths[path] = {...paths[path], [spec.method]: operation(spec)};
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Everise API',
      version: '1.0.0',
      description:
        'The API behind everise.dev. Generated from the routes (src/api).',
    },
    paths,
    components: {
      schemas: {
        ...components(requestSchemas, 'input'),
        ...components(responseSchemas, 'output'),
      },
      securitySchemes: {
        token: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: '`Token <jwt>`, or the `token` cookie the site sets.',
        },
      },
    },
  };
}

export {buildOpenApiDocument};
