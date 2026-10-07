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
for (const file of files) {
  const limit = LIMITS.find(l => l.test(file));
  if (!limit) continue;
  const lines = readFileSync(file, 'utf8').trimEnd().split('\n').length;
  const {max} = limit;
  if (lines > max) {
    over.push(`${file}: ${lines} lines (a ${limit.kind} may have ${max})`);
  }
}

if (over.length > 0) {
  console.error(
    'Too long; split it (a router per resource, plain functions, a smaller service):\n  ' +
      over.join('\n  '),
  );
  process.exit(1);
}
console.log(`File sizes: ${files.length} files within their limits.`);
