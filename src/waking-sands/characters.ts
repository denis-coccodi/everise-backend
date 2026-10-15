import {
  AYMERIC,
  CID,
  EMET_SELCH,
  GAIUS,
  HAURCHEFANT,
  HYTHLODAEUS,
  VENAT,
  ZENOS,
} from './cast-allies';
import {BARNABY, BERNADETTE} from './cast-everise';
import {
  ALISAIE,
  ALPHINAUD,
  ESTINIEN,
  GRAHA,
  KRILE,
  TATARU,
  THANCRED,
  URIANGER,
  YSHTOLA,
} from './cast-scions';
import {Character} from './character';

// Who a character is as a post's author (Tataru posts guests' roulette
// results) and as the owner of their uploaded pictures: not a member.
const CHARACTER_PREFIX = 'character:';

function characterAuthorId(id: string) {
  return `${CHARACTER_PREFIX}${id}`;
}

// The character an author id names, if it names one.
function characterOfAuthor(authorId: string) {
  return authorId.startsWith(CHARACTER_PREFIX)
    ? characterById(authorId.slice(CHARACTER_PREFIX.length))
    : undefined;
}

// Everyone members can invite, in the picker's order. However many there
// are, at most MAX_PRESENT are in the room (and in a prompt) at once.
const CHARACTERS: Character[] = [
  TATARU,
  URIANGER,
  YSHTOLA,
  BARNABY,
  BERNADETTE,
  THANCRED,
  ALPHINAUD,
  ALISAIE,
  KRILE,
  GRAHA,
  ESTINIEN,
  AYMERIC,
  HAURCHEFANT,
  CID,
  GAIUS,
  ZENOS,
  EMET_SELCH,
  HYTHLODAEUS,
  VENAT,
];

function characterById(id: string) {
  return CHARACTERS.find(character => character.id === id);
}

export {
  Character,
  characterAuthorId,
  characterById,
  characterOfAuthor,
  CHARACTERS,
  TATARU,
};
