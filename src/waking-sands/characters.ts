import {ALISAIE} from './cast/alisaie';
import {ALPHINAUD} from './cast/alphinaud';
import {AYMERIC} from './cast/aymeric';
import {BARNABY} from './cast/barnaby';
import {BERNADETTE} from './cast/bernadette';
import {CID} from './cast/cid';
import {EMET_SELCH} from './cast/emet-selch';
import {ESTINIEN} from './cast/estinien';
import {FANDANIEL} from './cast/fandaniel';
import {GAIUS} from './cast/gaius';
import {GRAHA} from './cast/graha';
import {HAURCHEFANT} from './cast/haurchefant';
import {HYTHLODAEUS} from './cast/hythlodaeus';
import {KRILE} from './cast/krile';
import {METEION} from './cast/meteion';
import {TATARU} from './cast/tataru';
import {THANCRED} from './cast/thancred';
import {URIANGER} from './cast/urianger';
import {VENAT} from './cast/venat';
import {YOTSUYU} from './cast/yotsuyu';
import {YSHTOLA} from './cast/yshtola';
import {ZENOS} from './cast/zenos';
import {Character} from './sands-model';

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

// Everyone members can invite, one file each in cast/, in the picker's
// order. However many there are, at most MAX_PRESENT are in the room (and in
// a prompt) at once.
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
  YOTSUYU,
  FANDANIEL,
  EMET_SELCH,
  HYTHLODAEUS,
  VENAT,
  METEION,
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
