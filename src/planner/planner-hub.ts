import {DurableObject} from 'cloudflare:workers';
import {config} from '../config';
import {
  ForbiddenError,
  HttpError,
  NotFoundError,
  UnavailableError,
  UpstreamError,
} from '../errors';
import {FflogsClient} from './fflogs-client';
import {PullInput} from './fflogs-pull';
import {LocalPulls, PullSource} from './pull-source';

// The one hub every pull is read in, so its FFLogs token is shared.
const HUB_NAME = 'fflogs';
// Raised whenever the timeline's shape changes, so kept ones aren't used.
const TIMELINE_VERSION = 2;
// A finished pull never changes: kept this long in the data centre's
// cache, which drops what isn't used before then.
const CACHE_CONTROL = 'public, max-age=2592000';

// Reads pulls from FFLogs in the Worker. A pull is several MB of events: a
// Durable Object may use far more CPU per request than a Worker on the
// Free plan (30 s, not 10 ms), which reading it needs.
class PlannerHub extends DurableObject {
  private readonly pulls = new LocalPulls(
    new FflogsClient(
      config.fflogs,
      (url, init) => fetch(url, init),
      () => new Date(),
    ),
  );

  // An error's class doesn't survive the trip back to the Worker, so the
  // app's own errors come back as their status and message.
  async timeline(input: PullInput): Promise<HubAnswer> {
    try {
      return {json: await this.pulls.timeline(input)};
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return {status: error.status, message: error.publicMessage};
    }
  }
}

type HubAnswer = {json: string} | {status: number; message: string};

// The app's error for a status the hub answered.
function hubError(status: number, message: string) {
  if (status === 403) return new ForbiddenError(message);
  if (status === 404) return new NotFoundError(message);
  if (status === 503) return new UnavailableError(message);
  return new UpstreamError(message);
}

// Reads pulls through the hub, and keeps finished ones in the data
// centre's cache (free, and it cleans itself up), so a pull looked at
// again costs no FFLogs points.
class HubPulls implements PullSource {
  constructor(private readonly hubs: DurableObjectNamespace<PlannerHub>) {}

  async timeline(input: PullInput, finished: boolean) {
    const cache = caches.default;
    const key = new Request(
      `https://planner.invalid/v${TIMELINE_VERSION}/${encodeURIComponent(input.code)}/${input.pullId}`,
    );
    const hit = await cache.match(key);
    if (hit) return hit.text();
    // RPC stubs drop the method's types: typed once here.
    const answer = (await this.hubs
      .getByName(HUB_NAME)
      .timeline(input)) as HubAnswer;
    if (!('json' in answer)) throw hubError(answer.status, answer.message);
    const text = answer.json;
    if (finished) {
      await cache.put(
        key,
        new Response(text, {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': CACHE_CONTROL,
          },
        }),
      );
    }
    return text;
  }
}

export {HubPulls, PlannerHub};
