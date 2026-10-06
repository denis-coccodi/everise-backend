import 'jest-extended';
import request from 'supertest';
import {
  MEMBER_DAILY_REPLIES,
  SITE_DAILY_REPLIES,
  WorkersAiModel,
} from '../../src/waking-sands';
import {TooManyRequestsError, UpstreamError} from '../../src/errors';
import {app, characters, clock, db, usersClient} from '../utils';

async function signedIn() {
  return (await usersClient.registerRandomUser()).user as {
    token: string;
    username: string;
    id: string;
  };
}

const ask = (token: string | undefined, body: object) => {
  const req = request(app).post('/api/waking-sands/replies').send(body);
  return token ? req.set('authorization', `Token ${token}`) : req;
};

const hello = {
  characters: ['tataru'],
  lines: [{from: 'member', text: 'Hello, Tataru!'}],
};

beforeEach(() => {
  characters.asked = [];
  characters.answers = [];
  characters.error = undefined;
});

afterEach(() => {
  clock.now = undefined;
});

describe('the Waking Sands characters', () => {
  test('lists Tataru with her picture, and that the chat is open', async () => {
    const response = await request(app).get('/api/waking-sands/characters');

    expect(response.status).toBe(200);
    expect(response.body.available).toBeTrue();
    expect(response.body.characters).toStrictEqual([
      {
        id: 'tataru',
        name: 'Tataru',
        title: 'Receptionist of the Scions of the Seventh Dawn',
        image: expect.stringContaining('/api/'),
      },
    ]);
  });
});

describe('talking in the Waking Sands', () => {
  test('Tataru answers the member', async () => {
    const member = await signedIn();
    characters.answers = ['Oh! Welcome to the Waking Sands!'];

    const response = await ask(member.token, hello);

    expect(response.status).toBe(200);
    expect(response.body.replies).toStrictEqual([
      {character: 'tataru', text: 'Oh! Welcome to the Waking Sands!'},
    ]);
  });

  test('tells the model who she is and who she is talking to', async () => {
    const member = await signedIn();

    await ask(member.token, {
      characters: ['tataru'],
      lines: [
        {from: 'member', text: 'Hi!'},
        {from: 'tataru', text: 'Hello there!'},
        {from: 'member', text: 'How much gil do the Scions have?'},
      ],
    });

    const [messages] = characters.asked;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Tataru Taru');
    expect(messages[0].content).toContain(member.username);
    expect(messages.slice(1)).toStrictEqual([
      {role: 'user', content: `${member.username}: Hi!`},
      {role: 'assistant', content: 'Hello there!'},
      {
        role: 'user',
        content: `${member.username}: How much gil do the Scions have?`,
      },
    ]);
  });

  test('keeps the turns alternating, starting with the member', async () => {
    const member = await signedIn();

    await ask(member.token, {
      characters: ['tataru'],
      lines: [
        {from: 'tataru', text: 'Welcome!'},
        {from: 'member', text: 'Hi!'},
        {from: 'member', text: 'Are you busy?'},
      ],
    });

    expect(characters.asked[0].slice(1)).toStrictEqual([
      {role: 'user', content: `${member.username} walks in.`},
      {role: 'assistant', content: 'Welcome!'},
      {
        role: 'user',
        content: `${member.username}: Hi!\n${member.username}: Are you busy?`,
      },
    ]);
  });

  test('sends only the latest lines', async () => {
    const member = await signedIn();
    const lines = Array.from({length: 30}, (_, i) => ({
      from: 'member',
      text: `line ${i}`,
    }));

    await ask(member.token, {characters: ['tataru'], lines});

    const content = characters.asked[0][1].content;
    expect(content).not.toContain('line 17\n');
    expect(content).toContain('line 18');
    expect(content).toContain('line 29');
  });

  test('drops a name the model wrote before her line', async () => {
    const member = await signedIn();
    characters.answers = ['**Tataru:** A modest fee, of course!'];

    const response = await ask(member.token, hello);

    expect(response.body.replies[0].text).toBe('A modest fee, of course!');
  });

  test('is for signed-in members only', async () => {
    const response = await ask(undefined, hello);

    expect(response.status).toBe(401);
    expect(characters.asked).toBeEmpty();
  });

  test.each([
    ['an unknown character', {...hello, characters: ['urianger']}],
    ['no character', {...hello, characters: []}],
    ['no lines', {...hello, lines: []}],
    [
      'a last line that is not the member’s',
      {...hello, lines: [{from: 'tataru', text: 'Hi'}]},
    ],
    [
      'a line that is too long',
      {...hello, lines: [{from: 'member', text: 'a'.repeat(1001)}]},
    ],
  ])('refuses %s', async (_case, body) => {
    const member = await signedIn();

    const response = await ask(member.token, body);

    expect(response.status).toBe(422);
    expect(characters.asked).toBeEmpty();
  });

  test(`allows a member ${MEMBER_DAILY_REPLIES} replies a day`, async () => {
    const member = await signedIn();
    clock.now = new Date('2026-10-06T22:00:00Z');
    for (let i = 0; i < MEMBER_DAILY_REPLIES; i++) {
      expect((await ask(member.token, hello)).status).toBe(200);
    }

    const refused = await ask(member.token, hello);

    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBe(String(2 * 60 * 60));
    expect(characters.asked).toHaveLength(MEMBER_DAILY_REPLIES);

    clock.now = new Date('2026-10-07T00:00:01Z');
    expect((await ask(member.token, hello)).status).toBe(200);
  });

  test(`stops for everyone after ${SITE_DAILY_REPLIES} replies a day`, async () => {
    const member = await signedIn();
    clock.now = new Date('2026-10-06T12:00:00Z');
    await db.set('chatUsage', '2026-10-06', {
      total: SITE_DAILY_REPLIES,
      members: {},
    });

    const refused = await ask(member.token, hello);

    expect(refused.status).toBe(429);
    expect(refused.body.errors.body[0]).toContain('closed');
    expect(characters.asked).toBeEmpty();
  });
});

describe('Workers AI', () => {
  const run = jest.fn();
  const model = new WorkersAiModel({run});
  const messages = [{role: 'user' as const, content: 'Hi'}];

  beforeEach(() => run.mockReset());

  test('reads the line from either answer shape', async () => {
    run.mockResolvedValueOnce({response: ' Hello! '});
    run.mockResolvedValueOnce({choices: [{message: {content: 'Welcome!'}}]});

    expect(await model.reply(messages)).toBe('Hello!');
    expect(await model.reply(messages)).toBe('Welcome!');
    expect(run).toHaveBeenCalledWith(
      expect.stringMatching(/^@cf\//),
      expect.objectContaining({messages})
    );
  });

  test('says the chat is closed once the free Neurons are used up', async () => {
    run.mockRejectedValue(
      new Error('4006: you have used up your daily free allocation')
    );

    await expect(model.reply(messages)).rejects.toBeInstanceOf(
      TooManyRequestsError
    );
  });

  test('reports any other failure as the service being unavailable', async () => {
    run.mockRejectedValueOnce(new Error('network down'));
    run.mockResolvedValueOnce({response: ''});

    await expect(model.reply(messages)).rejects.toBeInstanceOf(UpstreamError);
    await expect(model.reply(messages)).rejects.toBeInstanceOf(UpstreamError);
  });
});
