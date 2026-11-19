// Claude Code SessionStart hook: tells the session where it is and who else works in this repository, before its
// first command. Several Claude windows and agents share the repository's checkouts (see .claude/agents); a session
// that doesn't know which branch and worktree it's in, or what's uncommitted there, can carry off or trample another's
// work. What it prints is added to the session's context.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

let cwd = process.cwd();
try {
  cwd = JSON.parse(readFileSync(0, 'utf8')).cwd || cwd;
} catch {
  // No input: the current directory.
}

const git = (...args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8'}).trim();
  } catch {
    return null;
  }
};

const branch = git('branch', '--show-current');
const changed =
  git('status', '--porcelain')?.split('\n').filter(Boolean).length ?? 0;
const worktrees = git('worktree', 'list');
if (worktrees !== null) {
  console.log(
    [
      `This checkout: ${cwd}, on ${branch || 'a detached HEAD'}, ${changed} uncommitted file(s).`,
      'Worktrees of this repository (other sessions may be working in them; never edit or run git in theirs):',
      worktrees,
      'Make each change in its own worktree on a feature/, bugfix/ or hotfix/ branch (feature-branch skill).',
    ].join('\n'),
  );
}
