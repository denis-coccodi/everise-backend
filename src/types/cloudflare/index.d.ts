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
