import {EVENT_KINDS} from './fflogs-pull-query';
import {TimelinePhase} from './pull-timeline-model';

// An FFLogs event: its fields depend on its type.
type FflogsEvent = Record<string, unknown>;

interface FflogsPullActor {
  id: number;
  name: string;
  type: string;
  subType: string | null;
  server: string | null;
  petOwner: number | null;
}

interface FflogsPullData {
  // The pull's start and end, in ms from the report's start.
  startTime: number;
  endTime: number;
  // Where an Ultimate's phases began, as FFLogs names them.
  phases: TimelinePhase[];
  actors: FflogsPullActor[];
  // `type` is the ability's damage type (fflogs-pull.ts's DAMAGE_TYPES).
  abilities: {gameID: number; name: string; type?: number}[];
  events: Record<EventKind, FflogsEvent[]>;
}
type EventKind = keyof typeof EVENT_KINDS;

export {FflogsEvent, FflogsPullActor, FflogsPullData, EventKind};
