import {Duty} from './duty-model';

interface RawDuty extends Duty {
  contentType: string;
  memberType: number;
  // The game territory it's fought in (0 for none).
  territory: number;
}

interface ContentType {
  name: string;
  icon: number | null;
}

export {ContentType, RawDuty};
