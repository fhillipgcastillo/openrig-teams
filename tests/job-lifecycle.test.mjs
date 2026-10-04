import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture } from './fixture.mjs';

function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function project(f) {
  const repo = path.join(f.temporary, 'project');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'original');
  git(repo, 'add', 'tracked.txt');
  git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'fixture');
  return repo;
}

function worktree(f, repo) {
  const dir = path.join(f.temporary, 'job');
  git(repo, 'worktree', 'add', '-qb', 'feature/job', dir);
  return dir;
}

test('existing branch stops start before runtime checks or profile hooks', t => {
  const f = fixture(t);
  const repo = project(f);
  const dir = worktree(f, repo);
  fs.mkdirSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects'), { recursive: true });
  const marker = path.join(f.temporary, 'hook-ran');
  fs.writeFileSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects/project.sh'), `PROJECT_PATH='${repo}'\nprofile_create_worktree() { run touch '${marker}'; WORKTREE='${dir}'; }\n`);
  for (const options of [[], ['--plan']]) {
    const result = f.run('bin/rig-job', ['start', 'project', 'job', ...options]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /branch feature\/job already exists/);
    assert.match(result.stderr, new RegExp(dir));
    assert.equal(fs.existsSync(marker), false);
    assert.deepEqual(f.calls(), []);
  }
});

test('detach removes only the selected registration and preserves dirty files and branch', t => {
  const f = fixture(t);
  const repo = project(f);
  const dir = worktree(f, repo);
  const other = path.join(f.temporary, 'other');
  git(repo, 'worktree', 'add', '-qb', 'feature/other', other);
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'changed');
  fs.writeFileSync(path.join(dir, 'untracked.txt'), 'keep');
  const result = f.run('bin/rig-job', ['finish', 'project', 'job', '--repo', repo, '--detach-worktree']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'tracked.txt'), 'utf8'), 'changed');
  assert.equal(fs.readFileSync(path.join(dir, 'untracked.txt'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(dir, '.git')), false);
  const registered = git(repo, 'worktree', 'list', '--porcelain');
  assert.equal(registered.includes(`worktree ${dir}\n`), false);
  assert.equal(registered.includes(`worktree ${other}\n`), true);
  git(repo, 'show-ref', '--verify', 'refs/heads/feature/job');
});

test('detach plan preserves registration and files', t => {
  const f = fixture(t);
  const repo = project(f);
  const dir = worktree(f, repo);
  const before = git(repo, 'worktree', 'list', '--porcelain');
  const result = f.run('bin/rig-job', ['finish', 'project', 'job', '--repo', repo, '--detach-worktree', '--plan']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /worktree-detach/);
  assert.equal(git(repo, 'worktree', 'list', '--porcelain'), before);
  assert.equal(fs.existsSync(path.join(dir, '.git')), true);
  assert.deepEqual(f.calls(), []);
});

test('worktree deletion refuses dirty data and explains detach', t => {
  const f = fixture(t);
  const repo = project(f);
  const dir = worktree(f, repo);
  fs.writeFileSync(path.join(dir, 'untracked.txt'), 'keep');
  const result = f.run('bin/rig-job', ['finish', 'project', 'job', '--repo', repo, '--worktree']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--detach-worktree/);
  assert.equal(fs.readFileSync(path.join(dir, 'untracked.txt'), 'utf8'), 'keep');
  assert.match(git(repo, 'worktree', 'list', '--porcelain'), new RegExp(dir));
});

test('successful profile hook must remove both directory and Git registration', t => {
  const f = fixture(t);
  const repo = project(f);
  const dir = worktree(f, repo);
  fs.mkdirSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects/project.sh'), `PROJECT_PATH='${repo}'\nprofile_remove_worktree() { return 0; }\n`);
  const result = f.run('bin/rig-job', ['finish', 'project', 'job', '--worktree']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /still registered|still exists/);
  assert.equal(fs.existsSync(dir), true);
});

test('clean worktree deletion removes directory and registration while retaining branch', t => {
  const f = fixture(t);
  const repo = project(f);
  const dir = worktree(f, repo);
  const result = f.run('bin/rig-job', ['finish', 'project', 'job', '--repo', repo, '--worktree']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(dir), false);
  assert.equal(git(repo, 'worktree', 'list', '--porcelain').includes(`worktree ${dir}\n`), false);
  git(repo, 'show-ref', '--verify', 'refs/heads/feature/job');
});

test('locked worktree refuses detach and restores its files and Git link', t => {
  const f = fixture(t);
  const repo = project(f);
  const dir = worktree(f, repo);
  fs.writeFileSync(path.join(dir, 'untracked.txt'), 'keep');
  const link = fs.readFileSync(path.join(dir, '.git'), 'utf8');
  git(repo, 'worktree', 'lock', '--reason', 'fixture lock', dir);
  const result = f.run('bin/rig-job', ['finish', 'project', 'job', '--repo', repo, '--detach-worktree']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /locked/);
  assert.equal(fs.readFileSync(path.join(dir, '.git'), 'utf8'), link);
  assert.equal(fs.readFileSync(path.join(dir, 'untracked.txt'), 'utf8'), 'keep');
  assert.match(git(repo, 'worktree', 'list', '--porcelain'), /locked fixture lock/);
  assert.equal(fs.readdirSync(f.temporary).some(name => name.startsWith('.rig-detach-')), false);
});

test('conflicting cleanup flags fail before stopping teams', t => {
  const f = fixture(t);
  const repo = project(f);
  const dir = worktree(f, repo);
  const result = f.run('bin/rig-job', ['finish', 'project', 'job', '--repo', repo, '--worktree', '--detach-worktree']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /choose --worktree or --detach-worktree/);
  assert.equal(fs.existsSync(path.join(dir, '.git')), true);
  assert.deepEqual(f.calls(), []);
});

test('branch collision without a registered worktree still stops start', t => {
  const f = fixture(t);
  const repo = project(f);
  git(repo, 'branch', 'existing');
  const result = f.run('bin/rig-job', ['start', 'project', 'job', '--repo', repo, '--branch', 'existing']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /branch existing already exists/);
  assert.equal(fs.existsSync(path.join(f.temporary, 'project-worktrees')), false);
  assert.deepEqual(f.calls(), []);
});
