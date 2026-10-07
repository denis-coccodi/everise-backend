import {DurableObject} from 'cloudflare:workers';
import {LiveEvent, LiveFeed} from './live-feed';

// The one hub every client connects to.
const HUB_NAME = 'feed';

// The heartbeat clients send, answered by the runtime without waking the hub.
const PING = 'ping';
const PONG = 'pong';

// Holds the live updates' WebSockets and broadcasts events to them. Uses
// Cloudflare's WebSocket Hibernation API: the object sleeps between events
// with the sockets kept open, so idle connections cost nothing. Clients only
// listen; anything they send other than the heartbeat is ignored.
class LiveHub extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(PING, PONG)
    );
  }

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', {status: 426});
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, {status: 101, webSocket: pair[0]});
  }

  broadcast(message: string) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        // A socket that's closing: it leaves the list on its own.
      }
    }
  }

  // Clients only listen.
  webSocketMessage() {}

  webSocketClose(socket: WebSocket, code: number) {
    try {
      socket.close(code === 1005 ? 1000 : code);
    } catch {
      // Already closed.
    }
  }
}

// Publishes through the hub.
class HubLiveFeed implements LiveFeed {
  constructor(private readonly hubs: DurableObjectNamespace<LiveHub>) {}

  async publish(event: LiveEvent) {
    await this.hubs.getByName(HUB_NAME).broadcast(JSON.stringify(event));
  }
}

function connectToHub(hubs: DurableObjectNamespace<LiveHub>, request: Request) {
  return hubs.getByName(HUB_NAME).fetch(request);
}

export {HubLiveFeed, LiveHub, connectToHub};
