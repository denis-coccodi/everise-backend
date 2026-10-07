import {DurableObject} from 'cloudflare:workers';
import {DataCentre} from './data-centres';
import {Board, PartyFinderBoard, PartyFinderSource} from './party-finder-board';

// The one board every request reads.
const BOARD_NAME = 'board';

// Holds the Party Finder board in the Worker. A Durable Object may use far
// more CPU per request than a Worker on the Free plan (30 s, not 10 ms),
// which reading xivpf's whole list needs. The board lives in memory: when
// nobody has looked for a while the object is evicted, and the next look
// reads xivpf again.
class PartyFinderHub extends DurableObject {
  private readonly partyFinder = new PartyFinderBoard(
    url => fetch(url),
    () => new Date(),
  );

  board(dataCentre: DataCentre): Promise<Board | null> {
    return this.partyFinder.board(dataCentre);
  }
}

// Reads the board through the hub.
class HubPartyFinder implements PartyFinderSource {
  constructor(private readonly hubs: DurableObjectNamespace<PartyFinderHub>) {}

  async board(dataCentre: DataCentre) {
    // RPC stubs drop the method's generic types: typed once here.
    return (await this.hubs
      .getByName(BOARD_NAME)
      .board(dataCentre)) as Board | null;
  }
}

export {HubPartyFinder, PartyFinderHub};
