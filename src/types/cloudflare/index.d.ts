// Minimal typings for the Cloudflare Workers runtime modules this app uses.
// The full typings (@cloudflare/workers-types) require TypeScript 5.

declare module 'cloudflare:workers' {
  interface DurableObjectStorage {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
    list<T>(options: {prefix: string}): Promise<Map<string, T>>;
    deleteAll(): Promise<void>;
  }

  interface DurableObjectState {
    readonly storage: DurableObjectStorage;
    // WebSocket Hibernation: the object can sleep while sockets stay open.
    acceptWebSocket(socket: WebSocket): void;
    getWebSockets(): WebSocket[];
    setWebSocketAutoResponse(pair: WebSocketRequestResponsePair): void;
  }

  interface DurableObjectNamespace<T> {
    getByName(name: string): T;
  }

  abstract class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }

  const env: Record<string, unknown>;
}

declare module 'cloudflare:node' {
  function httpServerHandler(options: {port: number}): unknown;
}

// The Worker's requests and responses, and its WebSockets, reduced to what
// the live updates use.
interface WorkerRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: {get(name: string): string | null};
}

declare class Response {
  constructor(
    body: string | null,
    init?: {
      status?: number;
      headers?: Record<string, string>;
      webSocket?: WebSocket;
    }
  );
  readonly status: number;
}

interface WebSocket {
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

// A message the runtime answers by itself, without waking a Durable Object.
declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string);
}

// The Worker's global fetch, reduced to what the app uses.
declare function fetch(url: string): Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;
