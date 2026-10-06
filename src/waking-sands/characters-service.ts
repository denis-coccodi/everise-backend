import {Db, Doc} from '../db';
import {NotFoundError} from '../errors';
import {
  ProfileImagesService,
  TataruAccount,
  UsersService,
  profileImageUrl,
  uploadedImageId,
} from '../users';
import {CHARACTERS, Character, characterById} from './characters';

// What an admin changed about a character; unset fields keep the default.
interface CharacterDoc extends Doc {
  title?: string | null;
  persona?: string | null;
  // An uploaded picture's address (profileImages).
  image?: string | null;
}

// A character as the chat and the settings see it: the default with the
// admin's changes. `edited` says which fields differ from the default.
interface CharacterProfile {
  id: string;
  name: string;
  title: string;
  persona: string;
  defaultPersona: string;
  image?: string;
  // Tataru's bio: she is also the account that posts guests' results.
  bio?: string | null;
  edited: {title: boolean; persona: boolean};
}

interface CharacterChanges {
  // An empty value goes back to the default.
  title?: string | null;
  persona?: string | null;
  bio?: string | null;
}

// The owner of a character's uploaded pictures in profileImages.
const ownerOf = (id: string) => `character:${id}`;

// The characters with what admins changed (title, personality, picture).
// Tataru's picture and bio are her account's, so the feeds and the chat
// show the same Tataru.
class CharactersService {
  private readonly collection = 'characters';

  constructor(
    private readonly db: Db,
    private readonly usersService: UsersService,
    private readonly profileImagesService: ProfileImagesService,
    private readonly tataru: TataruAccount,
    private readonly siteUrl: string
  ) {}

  async all(): Promise<CharacterProfile[]> {
    const docs = await this.db.find<CharacterDoc>(this.collection);
    const tataru = await this.tataru.get();
    return CHARACTERS.map(character =>
      this.profile(
        character,
        docs.find(doc => doc.id === character.id),
        character.id === 'tataru' ? tataru : undefined
      )
    );
  }

  async get(id: string): Promise<CharacterProfile> {
    const profile = (await this.all()).find(character => character.id === id);
    if (!profile) {
      throw new NotFoundError('character');
    }
    return profile;
  }

  async update(id: string, changes: CharacterChanges) {
    const character = this.character(id);
    const doc = await this.db.get<CharacterDoc>(this.collection, id);
    const data: Record<string, unknown> = {
      title: doc?.title ?? null,
      persona: doc?.persona ?? null,
      image: doc?.image ?? null,
    };
    if (changes.title !== undefined) {
      data.title = custom(changes.title, character.title);
    }
    if (changes.persona !== undefined) {
      data.persona = custom(changes.persona, character.persona);
    }
    await this.db.set(this.collection, id, data);
    if (changes.bio !== undefined && id === 'tataru') {
      const tataru = await this.tataru.get();
      await this.usersService.updateUser(tataru.id, {bio: changes.bio ?? ''});
    }
    return this.get(id);
  }

  // A new picture, with the same checks as anyone's upload; the old one is
  // deleted. Tataru's goes on her account.
  async setPicture(id: string, picture: Uint8Array) {
    this.character(id);
    if (id === 'tataru') {
      const tataru = await this.tataru.get();
      const imageId = await this.profileImagesService.save(tataru.id, picture);
      await this.usersService.setImage(tataru.id, profileImageUrl(imageId));
      await this.deleteUpload(tataru.id, tataru.image);
      return this.get(id);
    }
    const doc = await this.db.get<CharacterDoc>(this.collection, id);
    const imageId = await this.profileImagesService.save(ownerOf(id), picture);
    await this.db.set(this.collection, id, {
      title: doc?.title ?? null,
      persona: doc?.persona ?? null,
      image: profileImageUrl(imageId),
    });
    await this.deleteUpload(ownerOf(id), doc?.image ?? undefined);
    return this.get(id);
  }

  private profile(
    character: Character,
    doc: CharacterDoc | undefined,
    account?: {image?: string; bio?: string}
  ): CharacterProfile {
    const shipped = character.picture
      ? `${this.siteUrl}/api/waking-sands/characters/${character.id}/picture`
      : undefined;
    return {
      id: character.id,
      name: character.name,
      title: doc?.title || character.title,
      persona: doc?.persona || character.persona,
      defaultPersona: character.persona,
      image: account ? account.image : doc?.image || shipped,
      ...(account ? {bio: account.bio || null} : {}),
      edited: {title: !!doc?.title, persona: !!doc?.persona},
    };
  }

  private character(id: string) {
    const character = characterById(id);
    if (!character) {
      throw new NotFoundError('character');
    }
    return character;
  }

  private async deleteUpload(owner: string, image: string | undefined) {
    const oldId = uploadedImageId(image);
    if (oldId) {
      await this.profileImagesService.delete(owner, oldId);
    }
  }
}

// The admin's text, or null (the default) when it's empty or the default.
function custom(value: string | null, fallback: string) {
  const text = value?.trim() ?? '';
  return text && text !== fallback.trim() ? text : null;
}

export {CharacterChanges, CharacterProfile, CharactersService};
