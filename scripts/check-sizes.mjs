// Fails when a file outgrows its kind's limit, so a router or service that
// keeps growing gets split instead (see the backend-best-practices skill):
// node scripts/check-sizes.mjs. Lines are counted as they are on disk.
import {readFileSync, readdirSync} from 'node:fs';

// The largest each kind of file may be, in lines. Tests aren't counted.
const LIMITS = [
  {kind: 'router', test: f => f.endsWith('-router.ts'), max: 300},
  {kind: 'service', test: f => f.endsWith('-service.ts'), max: 350},
  {kind: 'other TypeScript', test: f => f.endsWith('.ts'), max: 350},
];

// Files that were already over their limit when the check came in, each held
// to the size it had then: they may shrink, never grow. Lower or remove an
// entry when its file gets split.
const KNOWN_OVER = {
  'src/admin/admin-router.ts': 308,
  'src/users/users-router.ts': 398,
  'src/articles/articles-router.ts': 588,
  'src/users/users-service.ts': 522,
  'src/articles/articles-service.ts': 583,
  'src/waking-sands/waking-sands-service.ts': 499,
  'src/duties/xivapi-client.ts': 530,
};

const files = [];
const walk = dir => {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path);
    else if (!entry.name.endsWith('.d.ts')) files.push(path);
  }
};
walk('src');

const over = [];
const shrunk = [];
for (const file of files) {
  const limit = LIMITS.find(l => l.test(file));
  if (!limit) continue;
  const lines = readFileSync(file, 'utf8').trimEnd().split('\n').length;
  const max = KNOWN_OVER[file] ?? limit.max;
  if (lines > max) {
    over.push(`${file}: ${lines} lines (a ${limit.kind} may have ${max})`);
  } else if (file in KNOWN_OVER && lines < max) {
    shrunk.push(`${file}: ${lines} lines; lower its KNOWN_OVER entry`);
  }
}

if (shrunk.length > 0) console.log('Shrunk:\n  ' + shrunk.join('\n  '));
if (over.length > 0) {
  console.error(
    'Too long; split it (a router per resource, plain functions, a smaller service):\n  ' +
      over.join('\n  '),
  );
  process.exit(1);
}
console.log(`File sizes: ${files.length} files within their limits.`);
