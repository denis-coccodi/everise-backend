// Checks that a commit message starts the Conventional Commits way (feature-branch skill): `type(scope): summary`,
// e.g. `fix(events): keep the banner inside the card`. Run by git's commit-msg hook with the message file: as its
// argument, or in HUSKY_GIT_PARAMS. Git's own messages (merges, reverts, fixup!, squash!, amend!) pass as they are.
import {readFileSync} from 'node:fs';

const TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];
const CONVENTIONAL = new RegExp(
  String.raw`^(?:${TYPES.join('|')})(?:\([\w./-]+(?:, ?[\w./-]+)*\))?!?: \S`,
);
const FROM_GIT = /^(?:Merge |Revert "|fixup! |squash! |amend! )/;

const file = process.argv[2] || process.env.HUSKY_GIT_PARAMS;
if (!file) {
  console.error(
    'Usage: node scripts/check-commit-msg.mjs <commit message file>',
  );
  process.exit(1);
}
const first =
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find(line => line.trim() && !line.startsWith('#')) ?? '';
if (!CONVENTIONAL.test(first) && !FROM_GIT.test(first)) {
  console.error(
    `Commit message "${first}" isn't Conventional Commits. Start it with a type, an optional scope and a summary: ` +
      `"fix(events): keep the banner inside the card" (types: ${TYPES.join(', ')}; feature-branch skill).`,
  );
  process.exit(1);
}
