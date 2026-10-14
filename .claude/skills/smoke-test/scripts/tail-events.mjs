// Reads `wrangler tail --format json` from stdin (each event is a
// multi-line JSON object) and prints one line per event, then its logs and
// exceptions. `--cron` keeps only the cron trigger's runs.
//
//   npx wrangler tail --env staging --format json | node tail-events.mjs --cron
//   node tail-events.mjs < saved-tail.json
const onlyCron = process.argv.includes('--cron');
const BACKSLASH = String.fromCharCode(92);

let buffer = '';
let depth = 0;
let inString = false;
let escaped = false;
let start = -1;

function print(text) {
  let event;
  try {
    event = JSON.parse(text);
  } catch {
    return;
  }
  const cron = event.event?.cron;
  if (onlyCron && !cron) return;
  const request = event.event?.request;
  const what = cron
    ? `cron ${cron}`
    : request
      ? `${request.method} ${request.url}`
      : 'internal (Durable Object call)';
  console.log(
    `${new Date(event.eventTimestamp).toISOString()} ${event.outcome} ${what}`,
  );
  for (const log of event.logs ?? [])
    console.log(
      `  ${log.level}: ${[].concat(log.message).join(' ').slice(0, 300)}`,
    );
  for (const exception of event.exceptions ?? [])
    console.log(`  EXCEPTION ${exception.name}: ${exception.message}`);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  for (const c of chunk) {
    buffer += c;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === BACKSLASH) escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' && depth++ === 0) start = buffer.length - 1;
    else if (c === '}' && --depth === 0) {
      print(buffer.slice(start));
      buffer = '';
    }
  }
});
