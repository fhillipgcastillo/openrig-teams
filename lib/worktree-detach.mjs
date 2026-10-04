import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr.trim());
  return result.stdout.trim();
}

function detach(repo, worktree) {
  const source = fs.realpathSync(worktree);
  const common = git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  const targetCommon = git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  const targetGit = git(source, 'rev-parse', '--path-format=absolute', '--git-dir');
  const link = path.join(source, '.git');
  if (common !== targetCommon || common === targetGit || !fs.lstatSync(link).isFile()) throw new Error('Expected a linked worktree belonging to this repository');
  const holding = fs.mkdtempSync(path.join(path.dirname(source), '.rig-detach-'));
  const saved = path.join(holding, 'worktree');
  try {
    fs.renameSync(source, saved);
    try {
      git(repo, 'worktree', 'remove', source);
      fs.unlinkSync(path.join(saved, '.git'));
    } finally {
      try { fs.renameSync(saved, source); }
      catch (error) { throw new Error(`Files preserved at ${saved}; could not restore ${source}: ${error.message}`); }
    }
  } finally {
    if (fs.readdirSync(holding).length === 0) fs.rmdirSync(holding);
  }
}

try {
  if (process.argv.length !== 4) throw new Error('usage: worktree-detach REPO WORKTREE');
  detach(process.argv[2], process.argv[3]);
} catch (error) {
  console.error(`worktree-detach: ${error.message}`);
  process.exitCode = 1;
}
