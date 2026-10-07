import 'jest-extended';
import {Doc, SqlDocumentStore, copyKeyValueDocuments} from '../../src/db';
import {MemoryStorage} from '../utils/memory-storage';
import {SqliteStorage} from '../utils/sqlite-storage';

interface Post extends Doc {
  authorId: string;
  title: string;
  tags: string[];
  order?: number;
  draft?: boolean;
}

describe('SqlDocumentStore', () => {
  let db: SqlDocumentStore;

  beforeEach(() => {
    db = new SqlDocumentStore(new SqliteStorage());
  });

  test('creates, reads, updates and deletes documents', async () => {
    const created = await db.create<Post>('posts', {
      authorId: 'a1',
      title: 'Hello',
      tags: ['x'],
    });

    expect(created.id).toBeString();
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(await db.get('posts', created.id)).toEqual(created);

    const updated = await db.update<Post>('posts', created.id, {title: 'Hi'});
    expect(updated).toMatchObject({title: 'Hi', authorId: 'a1'});
    expect(updated!.createdAt).toEqual(created.createdAt);

    await db.delete('posts', created.id);
    expect(await db.get('posts', created.id)).toBeUndefined();
    expect(await db.update('posts', created.id, {title: 'x'})).toBeUndefined();
  });

  test('keeps updatedAt when an update changes nothing', async () => {
    const created = await db.create<Post>('posts', {authorId: 'a', title: 't'});
    await new Promise(resolve => setTimeout(resolve, 5));

    const same = await db.update<Post>('posts', created.id, {title: 't'});

    expect(same!.updatedAt).toEqual(created.updatedAt);
  });

  test('keeps dates and bytes as they were', async () => {
    const at = new Date('2026-01-02T03:04:05.006Z');
    const bytes = new Uint8Array([0, 1, 254, 255]);
    const doc = await db.set('files', 'f1', {at, bytes, nested: {at}});

    const read = await db.get<Doc & Record<string, unknown>>('files', doc.id);

    expect(read!.at).toEqual(at);
    expect(read!.bytes).toEqual(bytes);
    expect(read!.nested).toEqual({at});
  });

  test('finds by field and array item, sorted and paged', async () => {
    for (const [order, authorId, tags] of [
      [2, 'a', ['x', 'y']],
      [1, 'a', ['y']],
      [3, 'b', ['x']],
    ] as const) {
      await db.create('posts', {order, authorId, tags: [...tags], title: ''});
    }

    const byA = await db.find<Post>('posts', {
      where: [{field: 'authorId', op: '==', value: 'a'}],
      orderBy: [{field: 'order', direction: 'asc'}],
    });
    expect(byA.map(post => post.order)).toEqual([1, 2]);

    const tagged = await db.find<Post>('posts', {
      where: [{field: 'tags', op: 'array-contains', value: 'x'}],
      orderBy: [{field: 'order', direction: 'desc'}],
    });
    expect(tagged.map(post => post.order)).toEqual([3, 2]);

    const page = await db.find<Post>('posts', {
      orderBy: [{field: 'order', direction: 'asc'}],
      offset: 1,
      limit: 1,
    });
    expect(page.map(post => post.order)).toEqual([2]);
    expect(await db.find('other')).toEqual([]);
  });

  test('matches booleans, and not documents without the field', async () => {
    await db.create('users', {name: 'a', draft: false});
    await db.create('users', {name: 'b', draft: true});
    await db.create('users', {name: 'c'});

    const drafts = await db.find<Doc & {name: string}>('users', {
      where: [{field: 'draft', op: '==', value: false}],
    });

    expect(drafts.map(user => user.name)).toEqual(['a']);
  });

  test('applies a batch whole, or not at all', async () => {
    const a = await db.create('posts', {title: 'a'});
    const b = await db.create('posts', {title: 'b'});

    await db.batch([
      {op: 'delete', collection: 'posts', id: a.id},
      {op: 'update', collection: 'posts', id: b.id, data: {title: 'B'}},
    ]);
    expect(await db.get('posts', a.id)).toBeUndefined();
    expect(await db.get('posts', b.id)).toMatchObject({title: 'B'});

    // A write that fails halfway undoes the ones before it.
    const failing = {
      get title(): string {
        throw new Error('cannot read');
      },
    };
    await expect(
      db.batch([
        {op: 'update', collection: 'posts', id: b.id, data: {title: 'C'}},
        {op: 'update', collection: 'posts', id: b.id, data: failing},
      ]),
    ).rejects.toThrow('cannot read');
    expect(await db.get('posts', b.id)).toMatchObject({title: 'B'});
  });

  test('refuses field names that are not plain words', async () => {
    await expect(
      db.find('posts', {where: [{field: "x') OR 1=1 --", op: '==', value: 1}]}),
    ).rejects.toThrow('Bad field name');
  });
});

describe('copyKeyValueDocuments', () => {
  test('copies the old key-value documents once, keeping their dates', async () => {
    const createdAt = new Date('2025-05-05T00:00:00Z');
    const keyValue = new MemoryStorage();
    for (let i = 0; i < 250; i++) {
      keyValue.put(`articles/id-${String(i).padStart(3, '0')}`, {
        id: `id-${i}`,
        title: `Post ${i}`,
        createdAt,
        updatedAt: createdAt,
      });
    }
    keyValue.put('users/u1', {
      id: 'u1',
      email: 'a@example.com',
      createdAt,
      updatedAt: createdAt,
    });
    const db = new SqlDocumentStore(new SqliteStorage());

    expect(await copyKeyValueDocuments(keyValue, db)).toBe(251);
    expect(await db.find('articles')).toHaveLength(250);
    expect(await db.get('users', 'u1')).toEqual({
      id: 'u1',
      email: 'a@example.com',
      createdAt,
      updatedAt: createdAt,
    });

    // A later start finds it done, and copies nothing over newer data.
    await db.update('users', 'u1', {email: 'b@example.com'});
    expect(await copyKeyValueDocuments(keyValue, db)).toBe(0);
    expect(await db.get('users', 'u1')).toMatchObject({email: 'b@example.com'});
  });
});
