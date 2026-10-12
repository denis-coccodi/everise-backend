import 'jest-extended';
import {SqlDocumentStore} from '../../src/db';
import {profileImageUrl} from '../../src/users';
import {retireTataruAccount} from '../../src/waking-sands';
import {SqliteStorage} from '../utils/sqlite-storage';

// What Tataru's old account left in the database: the account (as it was
// made, a system account), her picture, a post, and a member following her.
async function oldAccount(db: SqlDocumentStore) {
  const account = await db.create('users', {
    username: 'Tataru',
    email: 'tataru@everise.invalid',
    bio: 'Receptionist, accountant and keeper of the books.',
    system: true,
  });
  await db.set('profileImages', 'picture-1', {
    userId: account.id,
    contentType: 'image/jpeg',
    size: 100,
  });
  await db.update('users', account.id, {image: profileImageUrl('picture-1')});
  const post = await db.create('articles', {
    authorId: account.id,
    title: 'Duty Found: Sastasha',
    body: 'Caught someone sneaking a roulette spin!',
  });
  const member = await db.create('users', {username: 'Minfilia', email: 'm@x'});
  const theirs = await db.create('articles', {
    authorId: member.id,
    title: 'Hello',
  });
  await db.create('follows', {followerId: member.id, followeeId: account.id});
  return {account, post, member, theirs};
}

describe("retiring Tataru's old account", () => {
  test('moves her posts and picture to the character, and deletes the account', async () => {
    const db = new SqlDocumentStore(new SqliteStorage());
    const {account, post, member, theirs} = await oldAccount(db);

    expect(await retireTataruAccount(db)).toBeTrue();

    expect(await db.get('users', account.id)).toBeUndefined();
    expect(await db.get('users', member.id)).toBeDefined();
    expect(await db.get('articles', post.id)).toMatchObject({
      authorId: 'character:tataru',
    });
    expect(await db.get('articles', theirs.id)).toMatchObject({
      authorId: member.id,
    });
    expect(await db.get('profileImages', 'picture-1')).toMatchObject({
      userId: 'character:tataru',
    });
    expect(await db.get('characters', 'tataru')).toMatchObject({
      title: null,
      persona: null,
      image: profileImageUrl('picture-1'),
    });
    expect(await db.find('follows')).toEqual([]);

    // Nothing left to do the next time.
    expect(await retireTataruAccount(db)).toBeFalse();
  });

  test('keeps a picture an admin already gave the character', async () => {
    const db = new SqlDocumentStore(new SqliteStorage());
    await db.set('characters', 'tataru', {
      title: 'Keeper of the ledger',
      persona: null,
      image: profileImageUrl('chosen'),
    });
    await oldAccount(db);

    await retireTataruAccount(db);

    expect(await db.get('characters', 'tataru')).toMatchObject({
      title: 'Keeper of the ledger',
      image: profileImageUrl('chosen'),
    });
  });

  test('does nothing where there was never an account', async () => {
    const db = new SqlDocumentStore(new SqliteStorage());

    expect(await retireTataruAccount(db)).toBeFalse();
    expect(await db.find('characters')).toEqual([]);
  });
});
