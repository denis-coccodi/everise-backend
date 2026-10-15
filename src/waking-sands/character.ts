// A character members can talk to in the Waking Sands, as the backend ships
// them. Each one is an AI model told who to be; the site says so next to the
// chat. Admins can change a character's title, personality and picture in
// the settings (CharactersService); these are the defaults.
// FINAL FANTASY XIV characters are Square Enix's: they appear here as
// non-commercial fan work.
interface Character {
  id: string;
  name: string;
  // A few words under the name in the picker.
  title: string;
  // Their profile's bio, as they'd write it (GET /api/profiles/character:<id>).
  bio: string;
  // Who they are and how they talk, for the model.
  persona: string;
  // Their picture in public/, served at /api/waking-sands/characters/:id/picture
  picture?: string;
}

export {Character};
