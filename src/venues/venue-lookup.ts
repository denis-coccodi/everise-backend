import {VenueLookup, isAt} from '../events';
import {VENUE_DATA_CENTRES} from './venue-data-centres';
import {placeOf} from './venue-place';
import {VenuesBoard} from './venues-board';

// The venue on the site an event is surely held at, for the event's page:
// the venue-page match the other way round. The only venue of its data
// centre this week it matches; null for none or more than one, or while
// FFXIV Venues can't be reached.
function venueLookup(board: VenuesBoard): VenueLookup {
  return async event => {
    const dataCentre = VENUE_DATA_CENTRES.find(
      name => name === event.dataCentre,
    );
    if (!dataCentre) return null;
    const matches = ((await board.shownEntries(dataCentre)) ?? []).filter(
      entry => isAt(event, placeOf(entry)),
    );
    return matches.length === 1
      ? {id: matches[0].id, name: matches[0].name}
      : null;
  };
}

export {venueLookup};
