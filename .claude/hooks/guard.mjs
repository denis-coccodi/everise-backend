// Claude Code PreToolUse hook (Bash and PowerShell): blocks the git commands
// that trample other sessions' work. Several Claude windows and agents share
// this repository's object store, stash and checkouts (see .claude/agents),
// so a command that is harmless alone can wipe or carry off someone else's
// changes. Exit code 2 blocks the command and shows the reason to Claude.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

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
