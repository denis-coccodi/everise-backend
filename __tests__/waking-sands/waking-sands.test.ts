import 'jest-extended';
import request from 'supertest';
import {MEMBER_SHARE, WorkersAiModel} from '../../src/waking-sands';
import {config} from '../../src/config';
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
  characters.neurons = 5;
  characters.error = undefined;
});

afterEach(() => {
  clock.now = undefined;
});

// The app may spend this many Neurons a day in the tests (utils/app.ts).
const DAILY_NEURONS = 1000;

describe('the Waking Sands characters', () => {
  test("lists Tataru, Urianger, Y'shtola and Barnaby with their pictures, and that the chat is open", async () => {
    const response = await request(app).get('/api/waking-sands/characters');

    expect(response.status).toBe(200);
    expect(response.body.available).toBeTrue();
    expect(response.body.characters).toStrictEqual([
      {
        id: 'tataru',
        name: 'Tataru',
        title: 'Receptionist of the Scions of the Seventh Dawn',
        image: expect.stringContaining('/api/profile-images/'),
      },
      {
        id: 'urianger',
        name: 'Urianger',
        title: 'Astrologian and scholar of Sharlayan',
        image: `${config.baseUrl}/api/waking-sands/characters/urianger/picture`,
      },
      {
        id: 'yshtola',
        name: "Y'shtola",
        title: 'Sorceress of the Scions of the Seventh Dawn',
        image: `${config.baseUrl}/api/waking-sands/characters/yshtola/picture`,
      },
      {
        id: 'barnaby',
        name: 'Barnaby Bollocksworth',
        title: 'Self-proclaimed primal slayer and a right bad influence',
        image: `${config.baseUrl}/api/waking-sands/characters/barnaby/picture`,
      },
    ]);
  });

  test.each(['urianger', 'yshtola', 'barnaby'])(
    "serves %s's picture",
    async id => {
      const response = await request(app).get(
        `/api/waking-sands/characters/${id}/picture`
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body.subarray(1, 4).toString()).toBe('PNG');
    }
  );

  test('has no picture for anyone else', async () => {
    for (const id of ['tataru', 'thancred']) {
      const response = await request(app).get(
        `/api/waking-sands/characters/${id}/picture`
      );
      expect(response.status).toBe(404);
    }
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
    // Swearing is up to the character; the limits aren't.
    expect(messages[0].content).toContain('Swear only if your description');
    expect(messages[0].content).toContain('no slurs');
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

  test('everyone present answers in turn, hearing the others', async () => {
    const member = await signedIn();
    characters.answers = [
      'Welcome, welcome!',
      'Verily, the stars foretold thy coming.',
      'Must you always be so dramatic, Urianger?',
    ];

    const response = await ask(member.token, {
      characters: ['tataru', 'urianger', 'yshtola'],
      lines: [{from: 'member', text: 'Hello, everyone!'}],
    });

    expect(response.body.replies).toStrictEqual([
      {character: 'tataru', text: 'Welcome, welcome!'},
      {character: 'urianger', text: 'Verily, the stars foretold thy coming.'},
      {
        character: 'yshtola',
        text: 'Must you always be so dramatic, Urianger?',
      },
    ]);
    const yshtola = characters.asked[2];
    expect(yshtola[0].content).toContain("Y'shtola Rhul");
    expect(yshtola[0].content).toContain(
      `${member.username}, Tataru, Urianger`
    );
    expect(yshtola[1]).toStrictEqual({
      role: 'user',
      content: [
        `${member.username}: Hello, everyone!`,
        'Tataru: Welcome, welcome!',
        'Urianger: Verily, the stars foretold thy coming.',
      ].join('\n'),
    });
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
    ['an unknown character', {...hello, characters: ['thancred']}],
    ['the same character twice', {...hello, characters: ['tataru', 'tataru']}],
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

  test(`lets a member spend ${
    MEMBER_SHARE * 100
  }% of the day's Neurons`, async () => {
    const member = await signedIn();
    clock.now = new Date('2026-10-06T22:00:00Z');
    characters.neurons = 50;
    const allowed = (DAILY_NEURONS * MEMBER_SHARE) / characters.neurons;
    for (let i = 0; i < allowed; i++) {
      expect((await ask(member.token, hello)).status).toBe(200);
    }

    const refused = await ask(member.token, hello);

    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBe(String(2 * 60 * 60));
    expect(refused.body.errors.body[0]).toContain('need their rest');
    expect(characters.asked).toHaveLength(allowed);
    // Someone else still can.
    const other = await signedIn();
    expect((await ask(other.token, hello)).status).toBe(200);

    clock.now = new Date('2026-10-07T00:00:01Z');
    expect((await ask(member.token, hello)).status).toBe(200);
  });

  test("stops for everyone once the site's Neurons for the day are spent", async () => {
    const member = await signedIn();
    clock.now = new Date('2026-10-06T12:00:00Z');
    await db.set('chatUsage', '2026-10-06', {
      neurons: DAILY_NEURONS,
      members: {},
    });

    const refused = await ask(member.token, hello);

    expect(refused.status).toBe(429);
    expect(refused.body.errors.body[0]).toContain('closed');
    expect(characters.asked).toBeEmpty();
  });

  test('counts what each reply cost', async () => {
    const member = await signedIn();
    clock.now = new Date('2026-10-08T12:00:00Z');
    characters.neurons = 3.5;

    await ask(member.token, {...hello, characters: ['tataru', 'yshtola']});

    const usage = await db.get<{
      id: string;
      createdAt: Date;
      updatedAt: Date;
      neurons: number;
      members: Record<string, number>;
    }>('chatUsage', '2026-10-08');
    expect(usage?.neurons).toBe(7);
    expect(usage?.members).toEqual({[member.id]: 7});
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

    expect((await model.reply(messages)).text).toBe('Hello!');
    expect((await model.reply(messages)).text).toBe('Welcome!');
    expect(run).toHaveBeenCalledWith(
      expect.stringMatching(/^@cf\//),
      expect.objectContaining({messages})
    );
  });

  test('reports what the reply cost, or prices its tokens', async () => {
    run.mockResolvedValueOnce({
      choices: [{message: {content: 'Hi'}}],
      usage: {prompt_tokens: 80, completion_tokens: 49, neurons: 2.06},
    });
    run.mockResolvedValueOnce({
      choices: [{message: {content: 'Hi'}}],
      usage: {prompt_tokens: 1_000_000, completion_tokens: 0},
    });
    run.mockResolvedValueOnce({response: 'Hi'});

    expect((await model.reply(messages)).neurons).toBe(2.06);
    expect((await model.reply(messages)).neurons).toBeCloseTo(9091);
    expect((await model.reply(messages)).neurons).toBe(20);
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
