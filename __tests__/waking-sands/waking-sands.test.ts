import 'jest-extended';
import request from 'supertest';
import {config} from '../../src/config';
import {TooManyRequestsError, UpstreamError} from '../../src/errors';
import {
  MAX_PRESENT,
  MEMBER_SHARE,
  TURNS_EACH,
  WorkersAiModel,
} from '../../src/waking-sands';
import {app, characters, clearDb, clock, db, live, usersClient} from '../utils';

// The app may spend this many Neurons a day in the tests (utils/app.ts).
const DAILY_NEURONS = 1000;

interface Member {
  token: string;
  username: string;
  id: string;
  image: string;
}

async function signedIn() {
  return (await usersClient.registerRandomUser()).user as Member;
}

const as = (member?: Member) => {
  const auth = <T extends request.Test>(req: T) =>
    member ? req.set('authorization', `Token ${member.token}`) : req;
  return {
    invite: (id: string) =>
      auth(request(app).post(`/api/waking-sands/room/characters/${id}`)),
    dismiss: (id: string) =>
      auth(request(app).delete(`/api/waking-sands/room/characters/${id}`)),
    say: (text: string) =>
      auth(request(app).post('/api/waking-sands/room/lines')).send({text}),
  };
};

const room = async () =>
  (await request(app).get('/api/waking-sands/room')).body;

// The lines of the room as "Name: text" (notes in brackets).
const script = async (): Promise<string[]> =>
  (await room()).lines.map(
    (line: {from: string; name: string; text: string}) =>
      line.from === 'note' ? `(${line.text})` : `${line.name}: ${line.text}`,
  );

beforeEach(async () => {
  await clearDb();
  characters.asked = [];
  characters.answers = [];
  characters.directed = [];
  characters.directions = [];
  characters.neurons = 5;
  characters.error = undefined;
  live.events = [];
  clock.now = undefined;
});

afterEach(() => {
  clock.now = undefined;
});

describe('the Waking Sands room', () => {
  test('shows every character with a picture, nobody in, nothing said, and that it is open', async () => {
    const body = await room();

    expect(body.available).toBeTrue();
    expect(body.present).toEqual([]);
    expect(body.lines).toEqual([]);
    expect(body.characters).toStrictEqual([
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
        `/api/waking-sands/characters/${id}/picture`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body.subarray(1, 4).toString()).toBe('PNG');
    },
  );

  test('a member brings characters in and sends them out, for everyone, live', async () => {
    const member = await signedIn();

    const invited = await as(member).invite('tataru');
    await as(member).invite('barnaby');
    const dismissed = await as(member).dismiss('tataru');

    expect(invited.status).toBe(200);
    expect(invited.body.present).toEqual(['tataru']);
    expect(dismissed.body.present).toEqual(['barnaby']);
    expect((await room()).present).toEqual(['barnaby']);
    expect(await script()).toEqual([
      `(${member.username} invited Tataru in.)`,
      `(${member.username} invited Barnaby Bollocksworth in.)`,
      `(Tataru leaves; ${member.username} saw them out.)`,
    ]);
    expect(live.events).toContainEqual({
      type: 'sands-presence',
      present: ['tataru', 'barnaby'],
    });
  });

  test('watching is open to all; talking and inviting need an account', async () => {
    expect((await as().say('Hello?')).status).toBe(401);
    expect((await as().invite('tataru')).status).toBe(401);
    expect((await as().dismiss('tataru')).status).toBe(401);
    expect((await request(app).get('/api/waking-sands/room')).status).toBe(200);
  });

  test.each([
    ['an empty line', ''],
    ['a line that is too long', 'a'.repeat(1001)],
  ])('refuses %s', async (_case, text) => {
    const response = await as(await signedIn()).say(text);

    expect(response.status).toBe(422);
  });

  test(`lets at most ${MAX_PRESENT} characters in at once`, async () => {
    const member = await signedIn();
    for (const id of ['tataru', 'urianger', 'yshtola']) {
      expect((await as(member).invite(id)).status).toBe(200);
    }

    const full = await as(member).invite('barnaby');

    expect(full.status).toBe(422);
    expect(full.body.errors.body[0]).toContain('The room is full');
    expect((await room()).present).toEqual(['tataru', 'urianger', 'yshtola']);
    // Someone already in can be invited again (nothing changes), and once
    // someone leaves there's room.
    expect((await as(member).invite('tataru')).status).toBe(200);
    await as(member).dismiss('urianger');
    expect((await as(member).invite('barnaby')).status).toBe(200);
  });

  test('refuses an unknown character, or sending out one who is not in', async () => {
    const member = await signedIn();

    expect((await as(member).invite('thancred')).status).toBe(422);
    expect((await as(member).dismiss('tataru')).status).toBe(404);
  });

  test('members talk with each other when no character is in', async () => {
    const [alisaie, alphinaud] = [await signedIn(), await signedIn()];

    const said = await as(alisaie).say('Anyone here?');
    await as(alphinaud).say('Just me.');

    expect(said.status).toBe(201);
    expect(said.body.line).toMatchObject({
      from: 'member',
      name: alisaie.username,
      memberId: alisaie.id,
      text: 'Anyone here?',
    });
    expect(await script()).toEqual([
      `${alisaie.username}: Anyone here?`,
      `${alphinaud.username}: Just me.`,
    ]);
    expect(characters.asked).toBeEmpty();
    expect(characters.directed).toBeEmpty();
  });

  test('a character alone answers once, with no director', async () => {
    const member = await signedIn();
    await as(member).invite('tataru');
    characters.answers = ['Oh! Welcome!'];

    await as(member).say('Hello, Tataru!');

    expect((await script()).slice(1)).toEqual([
      `${member.username}: Hello, Tataru!`,
      'Tataru: Oh! Welcome!',
    ]);
    expect(characters.directed).toBeEmpty();
    expect(live.events).toContainEqual({
      type: 'sands-writing',
      character: 'tataru',
    });
    expect(live.events[live.events.length - 1]).toEqual({
      type: 'sands-writing',
      character: null,
    });
  });

  test('with several in, the director picks who speaks, and they answer each other until a pause', async () => {
    const member = await signedIn();
    await as(member).invite('barnaby');
    await as(member).invite('yshtola');
    characters.directions = ['Barnaby', "Y'shtola", 'NONE'];
    characters.answers = [
      'Slew Titan with a spoon, I did.',
      'You were hiding behind a rock, Barnaby.',
    ];

    await as(member).say('Barnaby, how did you slay Titan?');

    expect((await script()).slice(2)).toEqual([
      `${member.username}: Barnaby, how did you slay Titan?`,
      'Barnaby Bollocksworth: Slew Titan with a spoon, I did.',
      "Y'shtola: You were hiding behind a rock, Barnaby.",
    ]);
    const [first, second] = characters.directed;
    expect(first[0].content).toContain("Someone must answer the member's");
    expect(first[0].content).not.toContain('or NONE');
    expect(second[0].content).toContain('or NONE');
    expect(second[1].content).toContain(
      'Barnaby Bollocksworth: Slew Titan with a spoon, I did.',
    );
  });

  test(`each character speaks at most ${TURNS_EACH} times before a member speaks again`, async () => {
    const member = await signedIn();
    await as(member).invite('barnaby');
    await as(member).invite('yshtola');
    characters.directions = Array.from({length: 20}, (_, i) =>
      i % 2 ? "Y'shtola" : 'Barnaby',
    );

    await as(member).say('Go on then, argue.');

    expect(characters.asked).toHaveLength(2 * TURNS_EACH);
  });

  test('someone always answers a member, even if the director says nobody', async () => {
    const member = await signedIn();
    await as(member).invite('tataru');
    await as(member).invite('urianger');
    characters.directions = ['NONE'];

    await as(member).say('Urianger, what do the stars say?');

    expect((await script()).slice(-1)[0]).toBe('Urianger: Hello!');
  });

  test('tells each character who is there and what was said', async () => {
    const [minfilia, thancred] = [await signedIn(), await signedIn()];
    await as(minfilia).invite('tataru');
    await as(thancred).say('Morning, all.');
    characters.asked = [];

    await as(minfilia).say('Tataru, any gil to spare?');

    const [messages] = characters.asked;
    expect(messages[0].content).toStartWith('You are Tataru Taru');
    expect(messages[0].content).toContain(
      `with ${thancred.username}, ${minfilia.username}.`,
    );
    expect(messages[0].content).toContain('Swear only if your description');
    expect(messages[0].content).toContain('no slurs');
    expect(messages.slice(1)).toEqual([
      {role: 'user', content: `${thancred.username}: Morning, all.`},
      {role: 'assistant', content: 'Hello!'},
      {
        role: 'user',
        content: `${minfilia.username}: Tataru, any gil to spare?`,
      },
    ]);
  });

  test('a character reads only the latest 8 lines', async () => {
    const member = await signedIn();
    for (let i = 1; i <= 10; i++) {
      await as(member).say(`line ${i}`);
    }
    await as(member).invite('tataru');

    await as(member).say('line 11');

    const heard = characters.asked[0]
      .slice(1)
      .map(message => message.content)
      .join('\n');
    // The 8 latest are lines 5 to 11 and the note that Tataru came in.
    expect(heard).not.toContain('line 4\n');
    expect(heard).toContain('line 5');
    expect(heard).toContain('line 11');
  });

  test('a member who writes while the characters are answering is answered by that round', async () => {
    const member = await signedIn();
    await as(member).invite('tataru');
    await db.set('sandsRoom', 'room', {
      present: ['tataru'],
      busyUntil: Date.now() + 60_000,
    });

    const response = await as(member).say('Me too!');

    expect(response.status).toBe(201);
    expect(characters.asked).toBeEmpty();
  });

  test('keeps the last day of lines', async () => {
    const member = await signedIn();
    clock.now = new Date('2026-10-06T10:00:00Z');
    await as(member).say('Yesterday.');
    clock.now = new Date('2026-10-07T09:00:00Z');
    await as(member).say('This morning.');

    clock.now = new Date('2026-10-07T10:30:00Z');
    expect(await script()).toEqual([`${member.username}: This morning.`]);
  });

  test("a model failure ends the round with a note, keeping the member's line", async () => {
    const member = await signedIn();
    await as(member).invite('tataru');
    characters.error = new UpstreamError('down');

    const response = await as(member).say('Hello?');

    expect(response.status).toBe(201);
    expect((await script()).slice(-2)).toEqual([
      `${member.username}: Hello?`,
      '(The room falls quiet: nobody could answer just now.)',
    ]);
  });

  test(`lets a member spend ${
    MEMBER_SHARE * 100
  }% of the day's Neurons`, async () => {
    const member = await signedIn();
    await as(member).invite('tataru');
    clock.now = new Date('2026-10-06T22:00:00Z');
    characters.neurons = 50;
    const allowed = (DAILY_NEURONS * MEMBER_SHARE) / characters.neurons;
    for (let i = 0; i < allowed; i++) {
      expect((await as(member).say('Hi')).status).toBe(201);
    }

    const refused = await as(member).say('Hi');

    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBe(String(2 * 60 * 60));
    expect(refused.body.errors.body[0]).toContain('need their rest');
    expect(characters.asked).toHaveLength(allowed);
    // Someone else still can.
    expect((await as(await signedIn()).say('Hi')).status).toBe(201);

    clock.now = new Date('2026-10-07T00:00:01Z');
    expect((await as(member).say('Hi')).status).toBe(201);
  });

  test("stops for everyone once the site's Neurons for the day are spent", async () => {
    const member = await signedIn();
    await as(member).invite('tataru');
    clock.now = new Date('2026-10-06T12:00:00Z');
    await db.set('chatUsage', '2026-10-06', {
      neurons: DAILY_NEURONS,
      members: {},
    });

    const refused = await as(member).say('Hello?');

    expect(refused.status).toBe(429);
    expect(refused.body.errors.body[0]).toContain('closed');
    expect(characters.asked).toBeEmpty();
  });

  test('counts every call, the director included, to the member who spoke', async () => {
    const member = await signedIn();
    await as(member).invite('tataru');
    await as(member).invite('yshtola');
    clock.now = new Date('2026-10-08T12:00:00Z');
    characters.neurons = 3.5;
    characters.directions = ['Tataru', 'NONE'];

    await as(member).say('Hello!');

    const usage = await db.get<{
      id: string;
      createdAt: Date;
      updatedAt: Date;
      neurons: number;
      members: Record<string, number>;
    }>('chatUsage', '2026-10-08');
    // Two director calls and one line.
    expect(usage?.neurons).toBe(10.5);
    expect(usage?.members).toEqual({[member.id]: 10.5});
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
      expect.objectContaining({messages}),
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
      new Error('4006: you have used up your daily free allocation'),
    );

    await expect(model.reply(messages)).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
  });

  test('reports any other failure as the service being unavailable', async () => {
    run.mockRejectedValueOnce(new Error('network down'));
    run.mockResolvedValueOnce({response: ''});

    await expect(model.reply(messages)).rejects.toBeInstanceOf(UpstreamError);
    await expect(model.reply(messages)).rejects.toBeInstanceOf(UpstreamError);
  });
});
