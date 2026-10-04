import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixture, installedPackage } from './fixture.mjs';
import { members } from '../lib/runtime-config.mjs';

const yaml = createRequire(path.join(installedPackage, 'package.json'))('yaml');
const { RigSpecSchema } = await import(pathToFileURL(path.join(installedPackage, 'daemon/dist/domain/rigspec-schema.js')));
const { validateAgentSpec } = await import(pathToFileURL(path.join(installedPackage, 'daemon/dist/domain/agent-manifest.js')));

function inventory(team, name, runtime = 'claude-code') {
  return members[team].map(member => ({ canonicalSessionName: `${team === 'lead' ? 'control' : team === 'pm' ? 'plan' : 'team'}-${member}@${name}`, rigName: name, runtime }));
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function project(f) {
  const repo = path.join(f.temporary, 'project');
  git(['init', '-q', repo]);
  git(['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '--allow-empty', '-qm', 'fixture']);
  return repo;
}

test('all team variants validate and mixed seats inject only the selected Codex profile', t => {
  const f = fixture(t);
  f.profile();
  for (const runtime of ['codex', 'claude-code']) {
    for (const approval of ['native', 'auto']) {
      f.settings({ runtime, approvals: { codex: approval, 'claude-code': approval } });
      for (const team of Object.keys(members)) {
        const output = path.join(f.root, 'rigs', team, 'rig.test.yaml');
        const result = f.run('bin/rig-runtime', ['render', team, `test-${team}`, output]);
        assert.equal(result.status, 0, result.stderr);
        const spec = yaml.parse(fs.readFileSync(output, 'utf8'));
        assert.equal(RigSpecSchema.validate(spec).valid, true);
        for (const pod of spec.pods) for (const seat of pod.members) {
          assert.equal(seat.runtime, runtime);
          assert.equal(seat.codex_config_profile, runtime === 'codex' && approval === 'auto' ? 'openrig-auto' : undefined);
        }
        assert.equal(spec.managed_blocks['claude-code'], 'CLAUDE.local.md');
      }
    }
  }
  f.settings({ seats: { 'fe.reviewer': { runtime: 'claude-code', approval: 'auto' }, 'fe.tester': { approval: 'auto' } } });
  const original = fs.readFileSync(path.join(f.root, 'rigs/fe/rig.yaml'), 'utf8');
  const output = path.join(f.root, 'rigs/fe/rig.mixed.yaml');
  assert.equal(f.run('bin/rig-runtime', ['render', 'fe', 'mixed', output]).status, 0);
  const seats = yaml.parse(fs.readFileSync(output, 'utf8')).pods[0].members;
  assert.deepEqual(seats.map(seat => seat.runtime), ['codex', 'claude-code', 'codex']);
  assert.deepEqual(seats.map(seat => seat.codex_config_profile), [undefined, undefined, 'openrig-auto']);
  assert.equal(fs.readFileSync(path.join(f.root, 'rigs/fe/rig.yaml'), 'utf8'), original);
});

test('all shared roles retain both harness resources and validate with OpenRig', t => {
  const f = fixture(t);
  const expected = ['shared:claude-default-settings', 'shared:claude-default-mcp', 'shared:codex-default-config', 'shared:claude-activity-hooks'];
  let count = 0;
  for (const team of fs.readdirSync(path.join(f.root, 'agents'))) {
    for (const role of fs.readdirSync(path.join(f.root, 'agents', team))) {
      const spec = yaml.parse(fs.readFileSync(path.join(f.root, 'agents', team, role, 'agent.yaml'), 'utf8'));
      const validation = validateAgentSpec(spec);
      assert.equal(validation.valid, true, JSON.stringify(validation));
      assert.deepEqual(spec.profiles.default.uses.runtime_resources, expected);
      count++;
    }
  }
  assert.equal(count, 9);
});

test('plan preserves the launch spec and does not query or change seats', t => {
  const f = fixture(t);
  f.settings({ runtime: 'claude-code', approvals: { codex: 'native', 'claude-code': 'auto' } });
  const launch = path.join(f.root, 'rigs/lead/rig.generated.yaml');
  fs.writeFileSync(launch, 'sentinel');
  const result = f.run('bin/rig-home', ['lead', 'plan']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(launch, 'utf8'), 'sentinel');
  assert.equal(fs.existsSync(path.join(f.root, 'rigs/lead/rig.generated.plan.yaml')), true);
  assert.match(result.stdout, /next launch/);
  assert.deepEqual(f.calls().map(call => call.slice(0, 2)), [['rig', 'up']]);
  assert.equal(f.calls()[0].includes('--plan'), true);
});

test('up saves Claude approvals after launch; resume saves them before launch', t => {
  const f = fixture(t);
  f.settings({ runtime: 'claude-code', approvals: { codex: 'native', 'claude-code': 'auto' } });
  const env = { TEST_INVENTORY: JSON.stringify(inventory('lead', 'lead')) };
  const up = f.run('bin/rig-home', ['lead', 'up'], env);
  assert.equal(up.status, 0, up.stderr);
  assert.deepEqual(f.calls().map(call => call[1]), ['up', 'ps', 'seat']);
  assert.equal(f.calls()[2].includes('auto'), true);
  fs.unlinkSync(f.env.TEST_LOG);
  const resume = f.run('bin/rig-home', ['lead', 'resume'], env);
  assert.equal(resume.status, 0, resume.stderr);
  assert.deepEqual(f.calls().map(call => call[1]), ['ps', 'seat', 'up']);
  assert.deepEqual(f.calls()[2], ['rig', 'up', 'lead', '--existing']);
});

test('failed launch or refused permission never triggers fallback or a restart', t => {
  const f = fixture(t);
  f.settings({ runtime: 'claude-code', approvals: { codex: 'native', 'claude-code': 'auto' } });
  assert.equal(f.run('bin/rig-home', ['lead', 'up'], { TEST_FAIL_COMMAND: 'up' }).status, 1);
  assert.deepEqual(f.calls().map(call => call[1]), ['up']);
  fs.unlinkSync(f.env.TEST_LOG);
  const result = f.run('bin/rig-home', ['lead', 'resume'], { TEST_INVENTORY: JSON.stringify(inventory('lead', 'lead')), TEST_FAIL_MODE: 'auto' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported mode/);
  assert.deepEqual(f.calls().map(call => call[1]), ['ps', 'seat']);
});

test('complete inventory validation precedes every permission mutation', t => {
  const f = fixture(t);
  f.settings({ runtime: 'claude-code' });
  const complete = inventory('fe', 'example');
  const invalid = [
    complete.slice(0, 2), [...complete, complete[0]],
    complete.map((seat, i) => i === 2 ? { ...seat, runtime: 'codex' } : seat),
    complete.map(seat => ({ ...seat, rigName: 'other' })),
  ];
  for (const value of invalid) {
    assert.equal(f.run('bin/rig-runtime', ['permissions', 'fe', 'example'], { TEST_INVENTORY: JSON.stringify(value) }).status, 1);
  }
  assert.equal(f.run('bin/rig-runtime', ['permissions', 'fe', 'example'], { TEST_INVENTORY: 'not JSON' }).status, 1);
  assert.equal(f.calls().every(call => call[1] === 'ps'), true);
  f.settings();
  assert.equal(f.run('bin/rig-runtime', ['permissions', 'fe', 'example'], { TEST_INVENTORY: JSON.stringify(inventory('fe', 'example', 'codex')) }).status, 0);
  assert.equal(f.calls().every(call => call[1] === 'ps'), true);
});

test('job preflight fails before branch/worktree mutations', t => {
  const f = fixture(t);
  const repo = project(f);
  const before = git(['-C', repo, 'branch', '--list']);
  const args = ['start', 'project', 'new-job', '--repo', repo];
  const missing = f.run('bin/rig-job', args);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /bin\/setup/);
  f.settings({ approvals: { codex: 'auto', 'claude-code': 'native' } });
  assert.equal(f.run('bin/rig-job', args).status, 1);
  f.profile();
  assert.equal(f.run('bin/rig-job', args, { TEST_FAIL_PROFILE: '1' }).status, 1);
  assert.equal(f.run('bin/rig-job', [...args, '--teams', 'fe,,be']).status, 1);
  assert.equal(git(['-C', repo, 'branch', '--list']), before);
  assert.equal(fs.existsSync(path.join(f.temporary, 'project-worktrees')), false);
  assert.equal(f.calls().some(call => call[0] === 'rig'), false);
});

test('runtime exclusions protect only selected generated paths and preserve outside rules', t => {
  const f = fixture(t);
  const repo = project(f);
  const exclude = path.join(repo, '.git/info/exclude');
  fs.writeFileSync(exclude, 'private-file\n');
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), 'owned instructions\n');
  git(['-C', repo, 'add', 'AGENTS.md']);
  const claude = f.run('bin/rig-exclude', [repo, '--runtime', 'claude-code']);
  assert.equal(claude.status, 0, claude.stderr);
  const prior = fs.readFileSync(exclude, 'utf8');
  assert.match(prior, /private-file/);
  assert.match(prior, /CLAUDE.local.md/);
  assert.equal(prior.includes('AGENTS.md'), false);
  for (const runtime of ['codex', 'both']) {
    assert.equal(f.run('bin/rig-exclude', [repo, '--runtime', runtime]).status, 2);
    assert.equal(fs.readFileSync(exclude, 'utf8'), prior);
  }
  const nested = path.join(repo, 'nested');
  fs.mkdirSync(nested);
  assert.equal(f.run('bin/rig-exclude', [nested, '--runtime', 'codex']).status, 2);
  assert.equal(fs.readFileSync(exclude, 'utf8'), prior);
  assert.equal(f.run('bin/rig-exclude', [repo, '--runtime', 'claude-code']).status, 0);
  assert.equal(fs.readFileSync(exclude, 'utf8').split('# >>> openrig-teams').length, 2);
});

test('mixed job plan passes runtime union and lifecycle cleanup needs no preferences', t => {
  const f = fixture(t);
  const repo = project(f);
  f.settings({ seats: { 'be.reviewer': { runtime: 'claude-code' } } });
  const planned = f.run('bin/rig-job', ['start', 'project', 'preview', '--repo', repo, '--teams', 'fe,be', '--plan']);
  assert.equal(planned.status, 0, planned.stderr);
  assert.match(planned.stdout, /rig-exclude.*--runtime both/);
  assert.deepEqual(f.calls(), []);
  const worktree = path.join(f.temporary, 'job');
  git(['-C', repo, 'worktree', 'add', '-qb', 'job', worktree]);
  fs.unlinkSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'runtime.json'));
  const name = f.run('bin/rig-team', ['fe', worktree, 'name']);
  assert.equal(name.status, 0, name.stderr);
  assert.equal(name.stdout.trim(), 'fe-project-job');
  assert.equal(f.run('bin/rig-team', ['fe', worktree, 'down']).status, 0);
  assert.equal(f.run('bin/rig-home', ['lead', 'name']).stdout.trim(), 'lead');
  assert.equal(f.run('bin/rig-home', ['lead', 'down']).status, 0);
  assert.deepEqual(f.calls().map(call => call[1]), ['down', 'down']);
});

test('switching runtime preserves existing artifact exclusions across worktrees', t => {
  const f = fixture(t);
  const repo = project(f);
  assert.equal(f.run('bin/rig-exclude', [repo, '--runtime', 'codex']).status, 0);
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), 'generated Codex content');
  assert.equal(f.run('bin/rig-exclude', [repo, '--runtime', 'claude-code']).status, 0);
  fs.writeFileSync(path.join(repo, 'CLAUDE.local.md'), 'generated Claude content');
  assert.equal(git(['-C', repo, 'status', '--porcelain']), '');
  assert.equal(f.run('bin/rig-exclude', [repo, '--runtime', 'codex']).status, 0);
  assert.equal(git(['-C', repo, 'status', '--porcelain']), '');
  const block = fs.readFileSync(path.join(repo, '.git/info/exclude'), 'utf8');
  assert.match(block, /AGENTS.md/);
  assert.match(block, /CLAUDE.local.md/);
});

test('department launch renders beside its template and checks every seat before resume', t => {
  const f = fixture(t);
  const repo = project(f);
  const worktree = path.join(f.temporary, 'job');
  git(['-C', repo, 'worktree', 'add', '-qb', 'job', worktree]);
  f.settings({ seats: { 'fe.reviewer': { runtime: 'claude-code' } } });
  const seats = inventory('fe', 'fe-project-job', 'codex');
  seats[1].runtime = 'claude-code';
  const result = f.run('bin/rig-team', ['fe', worktree, 'up'], { TEST_INVENTORY: JSON.stringify(seats) });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.calls().map(call => call[1]), ['up', 'ps', 'seat']);
  const launch = f.calls()[0][2];
  assert.equal(path.dirname(launch), path.join(f.root, 'rigs/fe'));
  const spec = yaml.parse(fs.readFileSync(launch, 'utf8'));
  const agent = path.resolve(path.dirname(launch), spec.pods[0].members[0].agent_ref.slice(6));
  assert.equal(fs.existsSync(path.join(agent, 'agent.yaml')), true);
  fs.unlinkSync(f.env.TEST_LOG);
  seats[2].runtime = 'claude-code';
  const refused = f.run('bin/rig-team', ['fe', worktree, 'resume'], { TEST_INVENTORY: JSON.stringify(seats) });
  assert.equal(refused.status, 1);
  assert.deepEqual(f.calls().map(call => call[1]), ['ps']);
});

test('job start prepares a worktree, keeps main instructions intact, and launches the mixed team', t => {
  const f = fixture(t);
  const repo = project(f);
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), 'Project conventions\n');
  git(['-C', repo, 'add', 'CLAUDE.md']);
  git(['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '-qm', 'project instructions']);
  f.settings({ seats: { 'fe.reviewer': { runtime: 'claude-code' } } });
  fs.mkdirSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects'));
  fs.writeFileSync(path.join(repo, 'private.md'), 'Local instructions\n');
  fs.writeFileSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects/project.sh'), `PROJECT_PATH='${repo}'\nCOPY_FILES=(private.md)\n`);
  const seats = inventory('fe', 'fe-project-new-job', 'codex');
  seats[1].runtime = 'claude-code';
  const result = f.run('bin/rig-job', ['start', 'project', 'new-job', '--teams', 'fe'], { TEST_INVENTORY: JSON.stringify(seats) });
  assert.equal(result.status, 0, result.stderr);
  const worktree = path.join(f.temporary, 'project-worktrees/new-job');
  assert.equal(fs.readFileSync(path.join(worktree, 'private.md'), 'utf8'), 'Local instructions\n');
  assert.equal(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), 'Project conventions\n');
  assert.equal(git(['-C', worktree, 'branch', '--show-current']), 'feature/new-job');
  const exclude = fs.readFileSync(path.join(repo, '.git/info/exclude'), 'utf8');
  assert.match(exclude, /AGENTS.md/);
  assert.match(exclude, /CLAUDE.local.md/);
  assert.deepEqual(f.calls().map(call => call[1]), ['up', 'ps', 'seat']);
});

test('project doctor uses selected runtimes when checking tracked instruction collisions', t => {
  const f = fixture(t);
  const repo = project(f);
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), 'Shared project instructions');
  git(['-C', repo, 'add', 'AGENTS.md']);
  f.settings({ runtime: 'claude-code' });
  const result = f.run('bin/rig-job', ['doctor', 'project', '--repo', repo]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /rig-exclude: ok \(claude-code\)/);
  assert.equal(result.stdout.includes('WARN'), false);
});
