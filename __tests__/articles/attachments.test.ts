import 'jest-extended';
import {readFileSync} from 'fs';
import {join} from 'path';
import request from 'supertest';
import {Doc} from '../../src/db';
import {app, clock, db, usersClient} from '../utils';

const gif = () => readFileSync(join(__dirname, '../fixtures/images/pixel.gif'));

async function member() {
  return (await usersClient.registerRandomUser()).user as {
    token: string;
    id: string;
  };
}

const as = (token: string) => ({
  post: (url: string) =>
    request(app).post(url).set('authorization', `Token ${token}`),
  put: (url: string) =>
    request(app).put(url).set('authorization', `Token ${token}`),
  delete: (url: string) =>
    request(app).delete(url).set('authorization', `Token ${token}`),
});

async function upload(token: string) {
  const response = await as(token).post('/api/media').send(gif());
  return response.body.media as {id: string; url: string};
}

const newPost = (media: unknown[], body = 'Look at these') => ({
  article: {title: 'With media', description: 'd', body, tagList: [], media},
});

describe('attachments on posts', () => {
  afterEach(() => {
    clock.now = undefined;
  });

  test('a post keeps up to 4 images, GIFs and videos, apart from its text', async () => {
    const {token} = await member();
    const uploaded = await upload(token);

    const response = await as(token)
      .post('/api/articles')
      .send(
        newPost([
          {
            kind: 'gif',
            url: uploaded.url,
            alt: ' A pixel ',
            width: 1,
            height: 1,
          },
          {kind: 'image', url: 'https://example.com/cat.png'},
          {kind: 'gif', url: 'https://media.giphy.com/media/x/giphy.gif'},
          {kind: 'video', url: 'https://youtu.be/dQw4w9WgXcQ?t=42', alt: ''},
        ]),
      );

    expect(response.status).toBe(201);
    expect(response.body.article.body).toBe('Look at these');
    expect(response.body.article.media).toStrictEqual([
      {kind: 'gif', url: uploaded.url, alt: 'A pixel', width: 1, height: 1},
      {kind: 'image', url: 'https://example.com/cat.png'},
      {kind: 'gif', url: 'https://media.giphy.com/media/x/giphy.gif'},
      {
        kind: 'video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
        videoId: 'dQw4w9WgXcQ',
        start: 42,
      },
    ]);
    const read = await request(app).get(
      `/api/articles/${response.body.article.id}`,
    );
    expect(read.body.article.media).toHaveLength(4);
  });

  test('refuses a fifth attachment, a video that is not YouTube, and a plain http image', async () => {
    const {token} = await member();
    const image = {kind: 'image', url: 'https://example.com/a.png'};

    const five = await as(token)
      .post('/api/articles')
      .send(newPost([image, image, image, image, image]));
    expect(five.status).toBe(422);
    expect(five.body.errors.body).toContain(
      'A post can have at most 4 images, GIFs or videos.',
    );

    const notYouTube = await as(token)
      .post('/api/articles')
      .send(newPost([{kind: 'video', url: 'https://vimeo.com/123'}]));
    expect(notYouTube.status).toBe(422);
    expect(notYouTube.body.errors.body).toContain(
      'That video link isn’t a YouTube video.',
    );

    const http = await as(token)
      .post('/api/articles')
      .send(newPost([{kind: 'image', url: 'http://example.com/a.png'}]));
    expect(http.status).toBe(422);
    expect(http.body.errors.body).toContain(
      'Images must have an https address.',
    );
  });

  test('a post with media may have no text', async () => {
    const {token} = await member();

    const response = await as(token)
      .post('/api/articles')
      .send(newPost([{kind: 'image', url: 'https://example.com/a.png'}], ''));

    expect(response.status).toBe(201);
    expect(response.body.article.body).toBe('');
  });

  test('deleting a post deletes its uploads, its comments and theirs', async () => {
    const author = await member();
    const commenter = await member();
    const posted = await upload(author.token);
    const commented = await upload(commenter.token);
    const {article} = (
      await as(author.token)
        .post('/api/articles')
        .send(newPost([{kind: 'gif', url: posted.url}]))
    ).body;
    await as(commenter.token)
      .post(`/api/articles/${article.id}/comments`)
      .send({comment: {body: '', media: [{kind: 'gif', url: commented.url}]}});

    await as(author.token).delete(`/api/articles/${article.id}`);

    expect((await request(app).get(`/api/media/${posted.id}`)).status).toBe(
      404,
    );
    expect((await request(app).get(`/api/media/${commented.id}`)).status).toBe(
      404,
    );
    expect(
      await db.find('comments', {
        where: [{field: 'articleId', op: '==', value: article.id}],
      }),
    ).toEqual([]);
  });

  test("removing an attachment deletes its upload; someone else's upload is never deleted", async () => {
    const author = await member();
    const other = await member();
    const mine = await upload(author.token);
    const theirs = await upload(other.token);
    const {article} = (
      await as(author.token)
        .post('/api/articles')
        .send(
          newPost([
            {kind: 'gif', url: mine.url},
            {kind: 'gif', url: theirs.url},
          ]),
        )
    ).body;

    const updated = await as(author.token)
      .put(`/api/articles/${article.id}`)
      .send({article: {media: []}});

    expect(updated.body.article.media).toEqual([]);
    expect((await request(app).get(`/api/media/${mine.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/media/${theirs.id}`)).status).toBe(
      200,
    );
  });

  test('an upload never attached is deleted a day later, at the next upload', async () => {
    const {token} = await member();
    clock.now = new Date('2026-10-07T09:00:00Z');
    const unused = await upload(token);
    const used = await upload(token);
    await as(token)
      .post('/api/articles')
      .send(newPost([{kind: 'gif', url: used.url}]));

    clock.now = new Date('2026-10-08T09:00:01Z');
    await upload(token);

    expect((await request(app).get(`/api/media/${unused.id}`)).status).toBe(
      404,
    );
    expect((await request(app).get(`/api/media/${used.id}`)).status).toBe(200);
  });
});

describe('attachments on comments', () => {
  test('a comment has at most one, and may then have no text', async () => {
    const {token} = await member();
    const {article} = (await as(token).post('/api/articles').send(newPost([])))
      .body;
    const image = {kind: 'image', url: 'https://example.com/a.png'};

    const one = await as(token)
      .post(`/api/articles/${article.id}/comments`)
      .send({comment: {body: '', media: [image]}});
    expect(one.status).toBe(201);
    expect(one.body.comment.media).toStrictEqual(image);

    const two = await as(token)
      .post(`/api/articles/${article.id}/comments`)
      .send({comment: {body: 'x', media: [image, image]}});
    expect(two.status).toBe(422);
    expect(two.body.errors.body).toContain(
      'A comment can have at most 1 image, GIF or video.',
    );

    const empty = await as(token)
      .post(`/api/articles/${article.id}/comments`)
      .send({comment: {body: ' '}});
    expect(empty.status).toBe(422);
    expect(empty.body.errors.body).toContain(
      'Write a comment, or add an image, GIF or video.',
    );
  });

  test('deleting a comment deletes its upload', async () => {
    const {token} = await member();
    const uploaded = await upload(token);
    const {article} = (await as(token).post('/api/articles').send(newPost([])))
      .body;
    const {comment} = (
      await as(token)
        .post(`/api/articles/${article.id}/comments`)
        .send({
          comment: {body: 'Look', media: [{kind: 'gif', url: uploaded.url}]},
        })
    ).body;

    await as(token).delete(
      `/api/articles/${article.id}/comments/${comment.id}`,
    );

    expect((await request(app).get(`/api/media/${uploaded.id}`)).status).toBe(
      404,
    );
  });
});

describe('posts from before attachments', () => {
  test('show the media in their text as attachments, and move it there when edited', async () => {
    const {token} = await member();
    const {article} = (await as(token).post('/api/articles').send(newPost([])))
      .body;
    // As such a post was stored: media in the text, no media field.
    await db.set('articles', article.id, {
      ...(await db.get('articles', article.id)),
      body: 'Hello\n\n![A cat](https://example.com/cat.png)\n\nhttps://youtu.be/dQw4w9WgXcQ\n\nBye',
      media: undefined,
    });

    const read = await request(app).get(`/api/articles/${article.id}`);
    expect(read.body.article.body).toBe('Hello\n\nBye');
    expect(read.body.article.media).toStrictEqual([
      {kind: 'image', url: 'https://example.com/cat.png', alt: 'A cat'},
      {
        kind: 'video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoId: 'dQw4w9WgXcQ',
      },
    ]);

    await as(token)
      .put(`/api/articles/${article.id}`)
      .send({article: {media: read.body.article.media.slice(0, 1)}});
    const stored = await db.get<Doc & {body: string; media: unknown[]}>(
      'articles',
      article.id,
    );
    expect(stored?.body).toBe('Hello\n\nBye');
    expect(stored?.media).toHaveLength(1);
  });
});
