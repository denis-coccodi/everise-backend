import 'jest-extended';
import {SqlDocumentStore} from '../../src/db';
import {MemoryFileStore, UploadStorage} from '../../src/files';
import {
  ProfileImagesService,
  TataruAccount,
  UsersService,
  uploadedImageId,
} from '../../src/users';
import {SqliteStorage} from '../utils/sqlite-storage';
import {readFile} from 'fs/promises';
import {join} from 'path';

describe('TataruAccount', () => {
  async function setup() {
    const db = new SqlDocumentStore(new SqliteStorage());
    const users = new UsersService(db);
    const images = new ProfileImagesService(
      db,
      new MemoryFileStore(),
      new UploadStorage(db, 1024 * 1024 * 1024),
    );
    const loads: string[] = [];
    const tataru = new TataruAccount(users, images, async path => {
      loads.push(path);
      return new Uint8Array(
        await readFile(join(__dirname, '../../public', path)),
      );
    });
    return {users, images, tataru, loads};
  }

  test('creates her with the bundled picture stored as her upload, once', async () => {
    const {images, tataru, loads} = await setup();

    const first = await tataru.get();
    const second = await tataru.get();

    expect(first.system).toBe(true);
    const id = uploadedImageId(first.image)!;
    expect((await images.get(id))?.contentType).toBe('image/png');
    expect(second.image).toBe(first.image);
    expect(loads).toEqual(['/assets/images/tataru.png']);
  });

  test("moves an existing Tataru off the site's old picture address", async () => {
    const {users, tataru} = await setup();
    const old = await users.getOrCreateSystemUser({
      username: 'Tataru',
      email: 'tataru@everise.invalid',
      bio: 'Old bio',
      image: 'https://prod.example/assets/images/tataru.png',
    });

    const moved = await tataru.get();

    expect(moved.id).toBe(old.id);
    expect(moved.bio).toBe('Old bio');
    expect(uploadedImageId(moved.image)).toBeString();
  });

  test('keeps her as she is when the bundled picture is missing', async () => {
    const db = new SqlDocumentStore(new SqliteStorage());
    const users = new UsersService(db);
    const tataru = new TataruAccount(
      users,
      new ProfileImagesService(
        db,
        new MemoryFileStore(),
        new UploadStorage(db, 1024 * 1024 * 1024),
      ),
      async () => undefined,
    );

    const created = await tataru.get();

    expect(created.username).toBe('Tataru');
    expect(created.image).toBeUndefined();
  });
});
