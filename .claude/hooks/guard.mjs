// Claude Code PreToolUse hook (Bash and PowerShell): blocks the git commands
// that trample other sessions' work. Several Claude windows and agents share
// this repository's object store, stash and checkouts (see .claude/agents),
// so a command that is harmless alone can wipe or carry off someone else's
// changes. Exit code 2 blocks the command and shows the reason to Claude.
import {execFileSync} from 'node:child_process';
import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = String(input.tool_input?.command ?? '');
const cwd = input.cwd || process.cwd();

// `git [-C <dir>] <sub>`, anywhere in a chained command.
const git = sub =>
  new RegExp(String.raw`\bgit(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))*\s+${sub}`);

// The directory a git command acts on: its -C, else the session's.
const dirOf = sub => {
  const m = command.match(
    new RegExp(String.raw`\bgit\s+-C\s+("[^"]*"|'[^']*'|\S+)\s+${sub}`),
  );
  return m ? m[1].replace(/^["']|["']$/g, '') : cwd;
};

const gitOut = (dir, ...args) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8'}).trim();
  } catch {
    return null;
  }
};

const block = reason => {
  process.stderr.write(`Blocked by .claude/hooks/guard.mjs: ${reason}\n`);
  process.exit(2);
};

// Arguments up to the end of this command, not into the next one after && or ;.
const ARGS = String.raw`(?:[^;&|\n]*\s)?`;

if (
  git(String.raw`add\s+${ARGS}(?:-A|--all|-u|--update|\.|\*)(?:\s|$)`).test(
    command,
  )
) {
  block(
    'stage files by name (git add <file> …). Other sessions share this repo, ' +
      'so -A, -u, "." or "*" can commit their work.',
  );
}

if (
  git(String.raw`stash(?:\s*$|\s*[;&|]|\s+pop\b)`).test(command) ||
  (git(String.raw`stash\s+push\b`).test(command) && !/\s-m\s/.test(command))
) {
  block(
    'the stash is shared by every worktree and session. Prefer a WIP commit; ' +
      'else `git stash push -u -m "<unique tag>"`, then `git stash apply <sha>` ' +
      'and drop your own entry (never pop).',
  );
}

if (
  git(String.raw`reset\s+${ARGS}--hard\b`).test(command) ||
  git(String.raw`clean\s+${ARGS}-\w*f`).test(command) ||
  git(String.raw`(?:checkout|restore)\s+(?:--\s+)?\.(?:\s|$)`).test(command)
) {
  block(
    'this discards every uncommitted change in the checkout, which may be ' +
      "another session's. Discard your own files by name instead, or ask the user.",
  );
}

const push = command.match(git(String.raw`push\s[^;&|\n]*`))?.[0];
if (push) {
  if (/\s(?:--force|-f)(?:\s|$)/.test(push)) {
    block('force-push with --force-with-lease, and only to your own branch.');
  }
  if (/\s(?:\S+:)?(?:refs\/heads\/)?main(?:\s|$)/.test(push)) {
    block('main only changes through pull requests (feature-branch skill).');
  }
}

if (git(String.raw`commit\b`).test(command)) {
  const branch = gitOut(dirOf('commit'), 'branch', '--show-current');
  if (branch === 'main' || branch === '') {
    block(
      `this checkout is on ${branch || 'a detached HEAD'}. Commit on a ` +
        'bugfix/, hotfix/ or feature/ branch, in your own worktree.',
    );
  }
}

// Switching branches carries uncommitted changes along, and in a shared
// checkout those may be another session's work in progress.
const switching = git(
  String.raw`(?:switch|checkout)\s+(?!--\s|\.(?:\s|$))(?:-[cCbB]\s+)?[\w./-]+`,
);
if (switching.test(command) && !/\s--\s/.test(command)) {
  const sub = String.raw`(?:switch|checkout)`;
  const status = gitOut(
    dirOf(sub),
    'status',
    '--porcelain',
    '--untracked-files=no',
  );
  if (status) {
    block(
      'this checkout has uncommitted changes, maybe from another session. ' +
        'Start a worktree instead (git worktree add ../<name> -b <branch> origin/main).',
    );
  }
}

// A new branch, or one renamed, is named feature/, bugfix/ or hotfix/<description> (feature-branch skill).
const all = re =>
  [...command.matchAll(new RegExp(re.source, 'g'))].map(m =>
    m[1].replace(/^["']|["']$/g, ''),
  );
const named = [
  ...all(git(String.raw`(?:switch\s+-[cC]|checkout\s+-[bB])\s+([^\s;&|]+)`)),
  ...all(git(String.raw`worktree\s+add\s+${ARGS}-[bB]\s+([^\s;&|]+)`)),
  ...all(git(String.raw`branch\s+-[mM]\s+(?:[^\s;&|]+\s+)?([^\s;&|]+)`)),
];
for (const name of named) {
  if (!/^(?:feature|bugfix|hotfix)\/[\w.-]+$/.test(name)) {
    block(
      `name the branch feature/, bugfix/ or hotfix/<description> (feature-branch skill), not "${name}".`,
    );
  }
}

// A production deploy's tag is prod-YYYY-MM-DD-HHMM (trunk-based skill).
for (const tag of all(git(String.raw`tag\s+${ARGS}(prod-[^\s;&|]*)`))) {
  if (!/^prod-\d{4}-\d{2}-\d{2}-\d{4}$/.test(tag))
    block(`tag a production deploy prod-YYYY-MM-DD-HHMM, not "${tag}".`);
}

// A pull request merges only once its `test` check has passed (feature-branch skill).
const merge = command.match(/\bgh\s+pr\s+merge\b([^;&|\n]*)/);
if (merge) {
  const args = merge[1].trim().split(/\s+/).filter(Boolean);
  const pr = args.find(
    (a, i) => !a.startsWith('-') && !['-R', '--repo'].includes(args[i - 1]),
  );
  const at = args.findIndex(a => a === '-R' || a === '--repo');
  const repo = at >= 0 ? args[at + 1] : undefined;
  let checks = null;
  try {
    const view = [
      'pr',
      'view',
      ...(pr ? [pr] : []),
      ...(repo ? ['--repo', repo] : []),
      '--json',
      'statusCheckRollup',
    ];
    checks = JSON.parse(
      execFileSync('gh', view, {cwd, encoding: 'utf8'}),
    ).statusCheckRollup;
  } catch {
    block(
      "couldn't read the pull request's checks; merge once `gh pr checks` shows `test` passed.",
    );
  }
  const test = checks.find(c => (c.name ?? c.context) === 'test');
  if ((test?.conclusion ?? test?.state) !== 'SUCCESS') {
    block(
      "the pull request's `test` check hasn't passed; merge only once it has.",
    );
  }
}

// Branch protection and rulesets are the user's: never changed to get something merged (feature-branch skill).
const api = command.match(/\bgh\s+api\b[^;&|\n]*/)?.[0];
if (
  api &&
  /\/(?:protection|rulesets)\b/.test(api) &&
  /(?:-X|--method)\s*['"]?(?:PUT|PATCH|POST|DELETE)\b|\s(?:-f|-F|--field|--raw-field|--input)\s/i.test(
    api,
  )
) {
  block(
    "branch protection and rulesets are the user's; if something blocks a merge, tell the user.",
  );
}

// Prettier on the files changed only, never a folder or a glob: a folder run rewrites untouched files' line endings.
const prettier = command.match(/\bprettier\b[^;&|\n]*/)?.[0];
if (prettier && /\s(?:--write|-w)\b/.test(prettier)) {
  const isDir = p => {
    try {
      return statSync(resolve(cwd, p)).isDirectory();
    } catch {
      return false;
    }
  };
  const targets = prettier
    .split(/\s+/)
    .slice(1)
    .map(a => a.replace(/^["']|["']$/g, ''))
    .filter(a => a && !a.startsWith('-'));
  if (
    targets.some(
      t => t === '.' || t.endsWith('/') || t.includes('*') || isDir(t),
    )
  ) {
    block(
      'run Prettier on the files you changed (npx prettier --write <file> …), not a folder or a glob.',
    );
  }
}

// Writes to production (the API or the site) are the user's call: asked first. Reads and staging stay free.
const PRODUCTION = /https?:\/\/(?:www\.|apis\.)?everise\.dev(?![\w.-])/i;
const curl = command.match(/\bcurl\b[^;&|\n]*/)?.[0];
const web = command.match(
  /\bInvoke-(?:WebRequest|RestMethod)\b[^;&|\n]*/i,
)?.[0];
const writes =
  (curl &&
    PRODUCTION.test(curl) &&
    /(?:-X|--request)\s*['"]?(?:POST|PUT|PATCH|DELETE)\b|\s(?:-d|--data[\w-]*|-F|--form|-T|--upload-file|--json)\s/i.test(
      curl,
    )) ||
  (web &&
    PRODUCTION.test(web) &&
    /-Method\s+['"]?(?:Post|Put|Patch|Delete)\b|\s-Body\s/i.test(web));
if (writes) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason:
          '.claude/hooks/guard.mjs: this writes to production (smoke-test skill).',
      },
    }),
  );
}
