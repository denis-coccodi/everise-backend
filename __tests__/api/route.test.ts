import * as express from 'express';
import request from 'supertest';
import {z} from 'zod';
import {requestSchema, responseSchema, route} from '../../src/api';
import {errorHandler} from '../../src/error-handler';

const Thing = responseSchema(
  'TestThing',
  z.strictObject({name: z.string(), size: z.number()}),
);
const NewThing = requestSchema(
  'TestNewThing',
  z.object({
    name: z.string().min(1).max(5),
    note: z.string().max(3, {error: 'Keep the note short.'}).optional(),
  }),
);

// A small app with one route, and the error handler the real one uses.
function appWith(answer: unknown) {
  const router = express.Router();
  route(
    router,
    {
      method: 'post',
      path: '/things/:id',
      summary: 'A test route',
      query: z.object({size: z.coerce.number().int().min(1).default(1)}),
      body: NewThing,
      responses: {201: {description: 'Made', schema: Thing}},
    },
    (req, res) => {
      res
        .status(201)
        .json(answer ?? {name: req.body.name, size: req.query.size});
    },
  );
  const app = express.default();
  app.use(express.json());
  app.use(router);
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      // Express tells error handlers by their four parameters.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _next: express.NextFunction,
    ) => errorHandler.handleError(err, res),
  );
  return app;
}

describe('route()', () => {
  test('parses the query and body before the handler', async () => {
    const response = await request(appWith(undefined))
      .post('/things/1?size=3')
      .send({name: 'cup'});

    expect(response.status).toBe(201);
    expect(response.body).toEqual({name: 'cup', size: 3});
  });

  test('answers 422 with a message for every field that failed', async () => {
    const response = await request(appWith(undefined))
      .post('/things/1?size=0')
      .send({name: '', note: 'too long'});

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      '"size" must be at least 1',
      '"name" can\'t be empty',
      'Keep the note short.',
    ]);
  });

  test('says which field is missing', async () => {
    const response = await request(appWith(undefined))
      .post('/things/1')
      .send({});

    expect(response.body.errors.body).toEqual(['"name" is required']);
  });

  test('fails a response that does not match its schema', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(appWith({name: 'cup', size: 1, extra: true}))
      .post('/things/1')
      .send({name: 'cup'});
    spy.mockRestore();

    expect(response.status).toBe(500);
  });
});
