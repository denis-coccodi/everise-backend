import {CharacterModel, ModelMessage} from './character-model';
import {CharacterProfile, CharactersService} from './characters-service';
import {NeuronBudget} from './neuron-budget';
import {clean} from './room-prompts';

// A remark is the text of a post, so it stays short.
const MAX_REMARK_LENGTH = 400;

// A character's remark for a post on the feeds, written by the model in
// their voice from their personality as admins set it, e.g. Tataru's on a
// guest's roulette result. Its Neurons come out of the Waking Sands' budget.
// Nothing here ever fails the post: without a model, Neurons or an answer,
// there's no remark and the caller uses its own words.
class CharacterRemarks {
  constructor(
    private readonly model: CharacterModel | undefined,
    private readonly charactersService: CharactersService,
    private readonly budget: NeuronBudget,
  ) {}

  // `id`'s remark on `occasion` (what happened and what to write), charged
  // to `payer`; undefined when there's none.
  async remark(id: string, occasion: string, payer: string) {
    if (!this.model || !this.budget.available) return undefined;
    try {
      const character = await this.charactersService.get(id);
      await this.budget.check(payer);
      const {text, neurons} = await this.model.reply(
        remarkPrompt(character, occasion),
      );
      await this.budget.spend(payer, neurons);
      return shorten(clean(text, character).replace(/^"|"$/g, '')) || undefined;
    } catch (err) {
      console.error('A character remark failed', err);
      return undefined;
    }
  }
}

function remarkPrompt(
  character: CharacterProfile,
  occasion: string,
): ModelMessage[] {
  const system = `${character.persona}

The scene: you are writing a short post on the website of Everise, a free company (player guild) on FINAL FANTASY XIV, which its members and visitors read in its feed.
How to write it:
- Write only the post's text: one or two short sentences, in the first person, in your own voice. No title, no hashtags, no quotation marks, no name before it.
- Stay in character and in Eorzea.
- Swear only if your description above says you do. Whatever it says: no slurs, never mock anyone for who they are, nothing sexual and nothing that encourages real harm.`;
  return [
    {role: 'system', content: system},
    {role: 'user', content: occasion},
  ];
}

function shorten(text: string) {
  return text.length > MAX_REMARK_LENGTH
    ? `${text.slice(0, MAX_REMARK_LENGTH).trimEnd()}…`
    : text;
}

export {CharacterRemarks, MAX_REMARK_LENGTH};
