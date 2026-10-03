import {DocumentStore} from '../../src/db';
import {MemoryStorage} from '../utils/memory-storage';

describe('DocumentStore export and one-time import', () => {
  const marker = 'copied-from-legacy';

  async function legacyWithData() {
    const legacy = new DocumentStore(new MemoryStorage());
    const user = await legacy.create('users', {username: 'alice'});
    const article = await legacy.create('articles', {
      authorId: user.id,
      slug: 'hello',
      tags: ['a'],
    });
    return {legacy, user, article};
  }

  test('exportAll returns every stored entry, with Dates intact', async () => {
    const {legacy, user} = await legacyWithData();

    const entries = await legacy.exportAll();

    expect(entries.map(([key]) => key.split('/')[0]).sort()).toEqual([
      'articles',
      'users',
    ]);
    const exportedUser = entries.find(([key]) => key === `users/${user.id}`);
    // Not toBeInstanceOf(Date): the clone comes from another JS realm under Jest.
    const createdAt = (exportedUser![1] as {createdAt: unknown}).createdAt;
    expect(Object.prototype.toString.call(createdAt)).toBe('[object Date]');
  });

  test('copies everything into an empty store once', async () => {
    const {legacy, user, article} = await legacyWithData();
    const store = new DocumentStore(new MemoryStorage());
    const source = jest.fn(() => legacy.exportAll());

    expect(await store.importOnce(marker, source)).toBe(2);
    expect(await store.importOnce(marker, source)).toBe(0);

    expect(source).toHaveBeenCalledTimes(1);
    expect(await store.get('users', user.id)).toEqual(user);
    expect(await store.get('articles', article.id)).toEqual(article);
    expect(await store.find('users')).toEqual([user]);
  });

  test('never overwrites a store that already holds documents', async () => {
    const {legacy} = await legacyWithData();
    const store = new DocumentStore(new MemoryStorage());
    const own = await store.create('users', {username: 'bob'});
    const source = jest.fn(() => legacy.exportAll());

    expect(await store.importOnce(marker, source)).toBe(0);

    expect(source).not.toHaveBeenCalled();
    expect(await store.find('users')).toEqual([own]);
  });

  test('redoes a copy that was interrupted', async () => {
    const {legacy, user} = await legacyWithData();
    const store = new DocumentStore(new MemoryStorage());

    await expect(
      store.importOnce(marker, async () => {
        throw new Error('connection lost');
      })
    ).rejects.toThrow('connection lost');

    expect(await store.importOnce(marker, () => legacy.exportAll())).toBe(2);
    expect(await store.get('users', user.id)).toEqual(user);
  });

  test('the marker does not show up in collection queries', async () => {
    const store = new DocumentStore(new MemoryStorage());

    await store.importOnce(marker, async () => []);

    expect(await store.find('users')).toEqual([]);
    expect(await store.find('_meta')).toEqual([]);
  });
});
