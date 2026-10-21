import {DurableObject} from 'cloudflare:workers';
import {config} from '../config';
import {FflogsClient} from './fflogs-client';
import {PullInput} from './fflogs-pull';
import {LocalPulls, PullSource} from './pull-source';

// The one hub every pull is read in, so its FFLogs token is shared.
const HUB_NAME = 'fflogs';
// Raised whenever the timeline's shape changes, so kept ones aren't used.
const TIMELINE_VERSION = 1;
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

  timeline(input: PullInput): Promise<string> {
    return this.pulls.timeline(input);
  }
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
    const text = (await this.hubs
      .getByName(HUB_NAME)
      .timeline(input)) as string;
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
