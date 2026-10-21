import request from 'supertest';
import {app, xivApi} from './app';
import {TERRITORIES} from './fake-fflogs';
import {duty} from './fake-xivapi';

// The game data's high-end duties, with the territories they're fought in:
// the Extreme trial's name doesn't say Extreme.
const territory = (id: number) => ({'TerritoryType@as(raw)': id});
function refreshGameData() {
  xivApi.reset();
  xivApi.sheets.ContentFinderCondition.push(
    duty(
      20,
      "the Minstrel's Ballad: Sphene's Burden",
      4,
      territory(TERRITORIES.ballad),
    ),
    duty(21, 'AAC Cruiserweight M1 (Savage)', 5, territory(TERRITORIES.savage)),
    duty(22, 'AAC Cruiserweight M1', 5, territory(TERRITORIES.normal)),
    duty(
      23,
      'Futures Rewritten (Ultimate)',
      28,
      territory(TERRITORIES.ultimate),
    ),
    duty(
      24,
      'the Akh Afah Amphitheatre (Unreal)',
      4,
      territory(TERRITORIES.unreal),
    ),
  );
  return request(app)
    .post('/api/duties/refresh')
    .set('X-Refresh-Key', process.env.DUTIES_REFRESH_KEY!);
}

export {refreshGameData};
