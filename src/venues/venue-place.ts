import {VenuePlace, districtOf} from '../events';
import {FfxivVenue} from './venue';

// Where the venue is, for matching the week's events to it: its house
// only when it's a plot in a housing district (not an apartment, or a
// place the owners describe in their own words).
function placeOf(entry: FfxivVenue): VenuePlace {
  const location = entry.location;
  const district = districtOf(location?.district);
  const isHouse =
    !!district &&
    !location?.override?.trim() &&
    !location?.apartment &&
    Number.isInteger(location?.ward) &&
    Number.isInteger(location?.plot) &&
    !!location?.ward &&
    !!location?.plot;
  return {
    world: location?.world || null,
    house: isHouse
      ? {district, ward: location!.ward!, plot: location!.plot!}
      : null,
    discord: entry.discord || null,
  };
}

export {placeOf};
