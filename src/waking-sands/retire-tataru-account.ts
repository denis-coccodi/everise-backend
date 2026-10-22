import {Db, Doc, Write} from '../db';
import {profileImageUrl, uploadedImageId} from '../users';
import {TATARU, characterAuthorId} from './characters';
import {CharacterDoc} from './sands-model';

// Tataru used to be a member account too, which posted guests' roulette
// results; now she is only the Waking Sands character, who posts them
// herself. The account is found by its address, which nobody else can have.
const OLD_ACCOUNT_EMAIL = 'tataru@everise.invalid';

interface OldAccountDoc extends Doc {
  image?: string;
}

// Moves what the old account left to the character, then deletes it: her
// posts become the character's, her uploaded pictures too (the one she
// showed becomes the character's, unless an admin gave the character one
// already), and follows of her go. Run by the database (EveriseDb) when it
// starts; does nothing once the account is gone, and a run cut short is
// finished by the next. True when there was an account.
async function retireTataruAccount(db: Db) {
  const [account] = await db.find<OldAccountDoc>('users', {
    where: [{field: 'email', op: '==', value: OLD_ACCOUNT_EMAIL}],
  });
  if (!account) return false;

  const author = characterAuthorId(TATARU.id);
  const byAccount = (collection: string, field: string) =>
    db.find(collection, {where: [{field, op: '==', value: account.id}]});
  const [posts, pictures, follows] = await Promise.all([
    byAccount('articles', 'authorId'),
    byAccount('profileImages', 'userId'),
    byAccount('follows', 'followeeId'),
  ]);

  const shown = uploadedImageId(account.image);
  const character = await db.get<CharacterDoc>('characters', TATARU.id);
  if (shown && pictures.some(p => p.id === shown) && !character?.image) {
    await db.set('characters', TATARU.id, {
      title: character?.title ?? null,
      persona: character?.persona ?? null,
      bio: character?.bio ?? null,
      image: profileImageUrl(shown),
    });
  }

  const writes: Write[] = [
    ...posts.map(post => ({
      op: 'update' as const,
      collection: 'articles',
      id: post.id,
      data: {authorId: author},
    })),
    ...pictures.map(picture => ({
      op: 'update' as const,
      collection: 'profileImages',
      id: picture.id,
      data: {userId: author},
    })),
    ...follows.map(follow => ({
      op: 'delete' as const,
      collection: 'follows',
      id: follow.id,
    })),
    // Last, so a run cut short finds the account again.
    {op: 'delete', collection: 'users', id: account.id},
  ];
  await db.batch(writes);
  return true;
}

export {OLD_ACCOUNT_EMAIL, retireTataruAccount};
