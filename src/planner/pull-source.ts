import {FflogsClient} from './fflogs-client';
import {PullInput, toTimeline} from './fflogs-pull';
import {readPull} from './fflogs-pull-query';

// Where pulls' timelines come from. Each is JSON text, sent to the browser
// as is: a pull is a few MB, more than a Worker request on the Free plan
// may parse (10 ms of CPU).
interface PullSource {
  // `finished`: the report won't change any more, so the timeline may be
  // kept.
  timeline(input: PullInput, finished: boolean): Promise<string>;
}

// Reads pulls from FFLogs in this process: in the Worker, inside the
// PlannerHub Durable Object (src/planner/planner-hub.ts); in tests, in the
// app. Requests for a pull being read wait for that read.
class LocalPulls implements PullSource {
  private readonly reading = new Map<string, Promise<string>>();

  constructor(private readonly client: FflogsClient) {}

  timeline(input: PullInput) {
    const key = `${input.code}:${input.pullId}`;
    let reading = this.reading.get(key);
    if (!reading) {
      reading = this.read(input).finally(() => this.reading.delete(key));
      this.reading.set(key, reading);
    }
    return reading;
  }

  private async read(input: PullInput) {
    const data = await readPull(this.client, input.code, input.pullId);
    return JSON.stringify(toTimeline(data, input));
  }
}

export {LocalPulls, PullSource};
