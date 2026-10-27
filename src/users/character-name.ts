import {z} from 'zod';
import {ValidationError} from '../errors';
import {DATA_CENTRES} from '../party-finder';

// A member's character in the game, optional: entered, it's what the site
// calls them everywhere ("Avar Kriss (Odin)"), their username otherwise.

// The game's rules: a forename and a surname of 2 to 15 letters each (an
// apostrophe or hyphen inside one, as in Y'shtola), 20 letters at most in
// all.
const NAME_PART = /^[A-Za-z][A-Za-z'-]*[A-Za-z]$/;
const PART_MAX = 15;
const NAME_MAX = 20;

const NAME_MESSAGE =
  "Enter your character's first and last name as the game shows them, like Avar Kriss.";
const WORLD_MESSAGE = "Choose your character's world from the list.";
const TOGETHER_MESSAGE =
  "Enter both your character's name and their world, or leave both empty.";

// Every public world's name, read once it's first needed.
let worlds: Set<string> | undefined;
const worldNames = () =>
  (worlds ??= new Set(
    Object.values(DATA_CENTRES).flatMap(list => list.map(world => world.name)),
  ));

function isCharacterName(name: string) {
  const parts = name.split(' ');
  return (
    parts.length === 2 &&
    parts.every(part => part.length <= PART_MAX && NAME_PART.test(part)) &&
    parts.join('').length <= NAME_MAX
  );
}

// The fields of the sign-up and settings forms. Empty or null clears them;
// spaces around and between the names are tidied.
const characterName = () =>
  z
    .string({error: NAME_MESSAGE})
    .transform(name => name.trim().replace(/\s+/g, ' '))
    .refine(name => name === '' || isCharacterName(name), {
      error: NAME_MESSAGE,
    })
    .transform(name => name || null)
    .nullable();

const server = () =>
  z
    .string({error: WORLD_MESSAGE})
    .transform(name => name.trim())
    .refine(name => name === '' || worldNames().has(name), {
      error: WORLD_MESSAGE,
    })
    .transform(name => name || null)
    .nullable();

// Both or neither: the name alone can't say who they are in the game.
function checkCharacter(character: {
  characterName?: string | null;
  server?: string | null;
}) {
  if (!character.characterName !== !character.server) {
    throw new ValidationError([TOGETHER_MESSAGE]);
  }
}

// What the site calls a member: their character and world when they gave
// them, their username otherwise.
function displayName(member: {
  username: string;
  characterName?: string | null;
  server?: string | null;
}) {
  return member.characterName && member.server
    ? `${member.characterName} (${member.server})`
    : member.username;
}

export {characterName, checkCharacter, displayName, server};
