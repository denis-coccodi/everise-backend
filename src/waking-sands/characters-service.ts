import {Db} from '../db';
import {NotFoundError} from '../errors';
import {ProfileImagesService, profileImageUrl, uploadedImageId} from '../users';
import {
  CHARACTERS,
  Character,
  characterAuthorId,
  characterById,
} from './characters';
import {CharacterChanges, CharacterDoc, CharacterProfile} from './sands-model';

// The owner of a character's uploaded pictures in profileImages.
const ownerOf = characterAuthorId;

// The characters with what admins changed (title, personality, bio,
// picture), as the chat, the settings, their profiles and the feeds
// (Tataru's posts) show them. Only admins change them: nobody can sign in
// as a character.
class CharactersService {
  private readonly collection = 'characters';

  constructor(
    private readonly db: Db,
    private readonly profileImagesService: ProfileImagesService,
    private readonly siteUrl: string,
  ) {}

  async all(): Promise<CharacterProfile[]> {
    const docs = await this.db.find<CharacterDoc>(this.collection);
    return CHARACTERS.map(character =>
      this.profile(
        character,
        docs.find(doc => doc.id === character.id),
      ),
    );
  }

  async get(id: string): Promise<CharacterProfile> {
    const character = this.character(id);
    const doc = await this.db.get<CharacterDoc>(this.collection, id);
    return this.profile(character, doc);
  }

  async update(id: string, changes: CharacterChanges) {
    const character = this.character(id);
    const doc = await this.db.get<CharacterDoc>(this.collection, id);
    const data: Record<string, unknown> = {
      title: doc?.title ?? null,
      persona: doc?.persona ?? null,
      bio: doc?.bio ?? null,
      image: doc?.image ?? null,
    };
    if (changes.title !== undefined) {
      data.title = custom(changes.title, character.title);
    }
    if (changes.persona !== undefined) {
      data.persona = custom(changes.persona, character.persona);
    }
    if (changes.bio !== undefined) {
      data.bio = custom(changes.bio, character.bio);
    }
    await this.db.set(this.collection, id, data);
    return this.get(id);
  }

  // A new picture, with the same checks as anyone's upload; the old one is
  // deleted.
  async setPicture(id: string, picture: Uint8Array) {
    this.character(id);
    const doc = await this.db.get<CharacterDoc>(this.collection, id);
    const imageId = await this.profileImagesService.save(ownerOf(id), picture);
    await this.db.set(this.collection, id, {
      title: doc?.title ?? null,
      persona: doc?.persona ?? null,
      bio: doc?.bio ?? null,
      image: profileImageUrl(imageId),
    });
    await this.deleteUpload(ownerOf(id), doc?.image ?? undefined);
    return this.get(id);
  }

  // Back to the picture the character ships with; the upload is deleted.
  async resetPicture(id: string) {
    this.character(id);
    const doc = await this.db.get<CharacterDoc>(this.collection, id);
    if (doc?.image) {
      await this.db.set(this.collection, id, {
        title: doc.title ?? null,
        persona: doc.persona ?? null,
        bio: doc.bio ?? null,
        image: null,
      });
      await this.deleteUpload(ownerOf(id), doc.image);
    }
    return this.get(id);
  }

  private profile(
    character: Character,
    doc: CharacterDoc | undefined,
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
      bio: doc?.bio || character.bio,
      image: doc?.image || shipped,
      edited: {
        title: !!doc?.title,
        persona: !!doc?.persona,
        bio: !!doc?.bio,
        image: !!doc?.image,
      },
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

export {CharactersService};
