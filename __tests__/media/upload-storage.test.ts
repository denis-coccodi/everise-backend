import 'jest-extended';
import {readFileSync} from 'fs';
import {join} from 'path';
import request from 'supertest';
import {createApp} from '../../src/app';
import {SqlDocumentStore} from '../../src/db';
import {MemoryFileStore, UploadStorage} from '../../src/files';
import {SqliteStorage} from '../utils/sqlite-storage';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../fixtures/images', name));

// A PNG of any size: a real header, then filler. Only the header is read.
function pngOf(bytes: number) {
  const png = Buffer.alloc(bytes);
  fixture('max.png').copy(png, 0, 0, 64);
  return png;
}

// A new site whose uploads may keep 3,000 bytes together, for each test.
const LIMIT = 3000;
let db: SqlDocumentStore;
let files: MemoryFileStore;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = new SqlDocumentStore(new SqliteStorage());
  files = new MemoryFileStore();
  app = createApp(db, undefined, undefined, undefined, {
    fileStore: files,
    uploadStorageBytes: LIMIT,
  });
});
const used = () => new UploadStorage(db, LIMIT).used();

// Without an email sender, a sign-up is signed in straight away.
async function signUp(email: string, username: string) {
  const response = await request(app)
    .post('/api/users')
    .send({user: {email, username, password: 'a-long-password-1'}});
  return response.body.user.token as string;
}

const uploadMedia = (token: string, body: Buffer) =>
  request(app)
    .post('/api/media')
    .set('authorization', `Token ${token}`)
    .send(body);
const uploadPicture = (token: string) =>
  request(app)
    .put('/api/user/image')
    .set('authorization', `Token ${token}`)
    .set('content-type', 'application/octet-stream')
    .send(fixture('small.png'));

describe("the site's storage for uploads", () => {
  test('counts every upload and deletion, and refuses what would go past the limit', async () => {
    const picture = fixture('small.png').length;
    const token = await signUp('storage@example.com', 'storage');

    expect((await uploadPicture(token)).status).toBe(200);
    expect((await uploadMedia(token, pngOf(1000))).status).toBe(201);
    expect((await uploadMedia(token, pngOf(1000))).status).toBe(201);
    expect(await used()).toBe(2000 + picture);

    const full = await uploadMedia(token, pngOf(1000));
    expect(full.status).toBe(507);
    expect(full.body.errors.body).toStrictEqual([
      "The site's storage for images is full for now. Link to an image instead, or try again later.",
    ]);
    expect(files.files.size).toBe(3);
    expect(await used()).toBe(2000 + picture);

    // A new picture replaces the old one: counted in, the old one out.
    expect((await uploadPicture(token)).status).toBe(200);
    expect(await used()).toBe(2000 + picture);

    expect(
      (
        await request(app)
          .delete('/api/user/image')
          .set('authorization', `Token ${token}`)
      ).status,
    ).toBe(200);
    expect(await used()).toBe(2000);
    expect((await uploadMedia(token, pngOf(1000))).status).toBe(201);
    expect(await used()).toBe(LIMIT);
  });

  test("a deleted member's uploads are counted out", async () => {
    // ADMIN_EMAILS is admin@example.com in the tests (utils/env.ts).
    const admin = await signUp('admin@example.com', 'Minfilia');
    const token = await signUp('leaving@example.com', 'leaving');
    await uploadPicture(token);
    await uploadMedia(token, pngOf(400));
    expect(await used()).toBe(400 + fixture('small.png').length);

    const deleted = await request(app)
      .delete('/api/admin/users/leaving')
      .set('authorization', `Token ${admin}`);

    expect(deleted.status).toBe(200);
    expect(await used()).toBe(0);
  });
});
