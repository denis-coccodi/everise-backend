import {Db} from '../db';
import {LiveFeed} from '../live/live-feed';
import {Auth} from '../middleware';
import {CharacterModel} from './character-ai';
import {CharacterRemarks} from './character-remarks';
import {CharactersService} from './characters-service';
import {NeuronBudget} from './neuron-budget';
import {LoadBundledPicture, WakingSandsRouter} from './waking-sands-router';
import {WakingSandsService} from './waking-sands-service';

// Everything the Waking Sands needs, put together for the app (src/app.ts).
interface WakingSandsParts {
  auth: Auth;
  db: Db;
  // What writes the characters' lines (Workers AI); without one the chat
  // isn't open.
  model?: CharacterModel;
  characters: CharactersService;
  liveFeed: LiveFeed;
  // The Neurons the characters may spend a day (WAKING_SANDS_DAILY_NEURONS).
  dailyNeurons: number;
  loadBundledPicture: LoadBundledPicture;
  now: () => Date;
}

// The chat's router, and the characters' remarks elsewhere (Tataru's lines
// for guests' roulette results), paid from the same daily Neurons.
function wakingSandsRoutes(parts: WakingSandsParts) {
  const budget = new NeuronBudget(parts.db, parts.now, parts.dailyNeurons);
  const service = new WakingSandsService(
    parts.db,
    parts.model,
    parts.characters,
    parts.liveFeed,
    parts.now,
    budget,
  );
  return {
    router: new WakingSandsRouter(parts.auth, service, parts.loadBundledPicture)
      .router,
    remarks: new CharacterRemarks(parts.model, parts.characters, budget),
  };
}

export {wakingSandsRoutes};
