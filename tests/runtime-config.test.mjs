import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { configDir, loadSettings, resolveSeat, validateSettings, findOpenRigPackage } from '../lib/runtime-config.mjs';
import { fixture } from './fixture.mjs';

test('configuration validation and effective seat resolution', () => {
  const value = { version: 1, runtime: 'codex', approvals: { codex: 'native', 'claude-code': 'auto' }, seats: { 'fe.reviewer': { runtime: 'claude-code' } } };
  assert.deepEqual(resolveSeat(validateSettings(value), 'fe', 'reviewer'), { runtime: 'claude-code', approval: 'auto' });
  assert.deepEqual(resolveSeat(value, 'fe', 'builder'), { runtime: 'codex', approval: 'native' });
  for (const invalid of [null, [], { ...value, extra: true }, { ...value, version: '1' }, { ...value, runtime: 'claude' }, { ...value, seats: { 'fe.unknown': {} } }, { ...value, approvals: { codex: 'bypass', 'claude-code': 'native' } }, { ...value, seats: { 'fe.builder': { model: 'x' } } }]) assert.throws(() => validateSettings(invalid));
  assert.throws(() => resolveSeat(value, 'unknown', 'builder'));
  assert.equal(configDir({ HOME: '/tmp/home', XDG_CONFIG_HOME: '/tmp/xdg', OPENRIG_TEAMS_CONFIG: '/tmp/explicit' }), '/tmp/explicit');
  assert.equal(configDir({ HOME: '/tmp/home', XDG_CONFIG_HOME: '', OPENRIG_TEAMS_CONFIG: '' }), '/tmp/home/.config/openrig-teams');
});

test('first setup requires explicit noninteractive choices and does not write on failure', t => {
  const f = fixture(t);
  for (const args of [[], ['--runtime', 'codex'], ['--runtime', 'codex', '--codex-approvals', 'native', '--seat', 'fe.nope=codex']]) {
    const result = f.run('bin/setup', args);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(fs.existsSync(f.env.OPENRIG_TEAMS_CONFIG), false);
    assert.equal(fs.existsSync(f.env.CODEX_HOME), false);
  }
  assert.deepEqual(f.calls(), []);
  assert.throws(() => loadSettings(f.env), /bin\/setup/);
});

test('Claude native setup needs no Codex and leaves an existing profile alone', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.commands, 'codex'));
  fs.mkdirSync(f.env.CODEX_HOME);
  const profile = path.join(f.env.CODEX_HOME, 'openrig-auto.config.toml');
  fs.writeFileSync(profile, 'custom');
  const result = f.run('bin/setup', ['--runtime', 'claude-code', '--claude-approvals', 'native']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(loadSettings(f.env).runtime, 'claude-code');
  assert.equal(fs.readFileSync(profile, 'utf8'), 'custom');
  assert.deepEqual(f.calls(), []);
  assert.equal(findOpenRigPackage(f.env), f.packageRoot);
});

test('Codex auto is installed only when selected and a conflict fails before writes', t => {
  const f = fixture(t);
  f.profile();
  const profile = path.join(f.env.CODEX_HOME, 'openrig-auto.config.toml');
  fs.writeFileSync(profile, 'custom');
  const result = f.run('bin/setup', ['--runtime', 'codex', '--codex-approvals', 'auto']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /differs/);
  assert.equal(fs.existsSync(path.join(f.root, 'agents/shared')), false);
  assert.equal(fs.existsSync(f.env.OPENRIG_TEAMS_CONFIG), false);
  fs.unlinkSync(profile);
  const installed = f.run('bin/setup', ['--runtime', 'codex', '--codex-approvals', 'native', '--seat-approval', 'fe.reviewer=auto']);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(fs.readFileSync(profile, 'utf8'), fs.readFileSync(path.join(f.root, 'profiles/openrig-auto.config.toml'), 'utf8'));
});

test('plan writes nothing; rerun preserves preferences, authorization, and project profile', t => {
  const f = fixture(t);
  const args = ['--runtime', 'codex', '--codex-approvals', 'native', '--seat', 'fe.reviewer=claude-code', '--claude-approvals', 'auto'];
  const planned = f.run('bin/setup', [...args, '--plan']);
  assert.equal(planned.status, 0, planned.stderr);
  assert.equal(fs.existsSync(f.env.OPENRIG_TEAMS_CONFIG), false);
  assert.equal(fs.existsSync(path.join(f.root, 'agents/shared')), false);
  assert.equal(f.run('bin/setup', args).status, 0);
  const global = path.join(f.env.OPENRIG_TEAMS_CONFIG, 'config.env');
  const project = path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects/private.sh');
  fs.writeFileSync(global, 'LEAD_MAY_SPAWN=1\n');
  fs.writeFileSync(project, 'PROJECT_PATH=/private\n');
  const file = path.join(f.env.OPENRIG_TEAMS_CONFIG, 'runtime.json');
  const handEdited = JSON.stringify(loadSettings(f.env));
  fs.writeFileSync(file, handEdited);
  const prior = fs.statSync(file).mtimeMs;
  assert.equal(f.run('bin/setup').status, 0);
  assert.equal(fs.statSync(file).mtimeMs, prior);
  assert.equal(fs.readFileSync(file, 'utf8'), handEdited);
  assert.equal(f.run('bin/setup', ['--seat', 'be.tester=claude-code']).status, 0);
  assert.equal(loadSettings(f.env).seats['fe.reviewer'].runtime, 'claude-code');
  assert.equal(fs.readFileSync(global, 'utf8'), 'LEAD_MAY_SPAWN=1\n');
  assert.equal(fs.readFileSync(project, 'utf8'), 'PROJECT_PATH=/private\n');
  assert.deepEqual(f.calls(), []);
});

test('invalid settings, missing selected CLIs and existing non-link targets fail without mutation', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.commands, 'claude'));
  assert.equal(f.run('bin/setup', ['--runtime', 'claude-code', '--claude-approvals', 'native']).status, 1);
  assert.equal(fs.existsSync(f.env.OPENRIG_TEAMS_CONFIG), false);
  fs.mkdirSync(path.join(f.root, 'agents/shared'));
  assert.equal(f.run('bin/setup', ['--runtime', 'codex', '--codex-approvals', 'native']).status, 1);
  assert.equal(fs.existsSync(f.env.OPENRIG_TEAMS_CONFIG), false);
  f.settings({ version: 2 });
  assert.equal(f.run('bin/setup').status, 1);
  assert.throws(() => loadSettings(f.env), /version/);
});

test('first interactive setup prompts for runtime and approval choices', t => {
  const f = fixture(t);
  const script = `import os, pty, select, sys, time
pid, master = pty.fork()
if pid == 0:
    os.execve(sys.argv[1], [sys.argv[1]], os.environ)
output = b''
answered_runtime = False
answered_approval = False
deadline = time.monotonic() + 8
while time.monotonic() < deadline:
    if select.select([master], [], [], 0.1)[0]:
        try:
            data = os.read(master, 65536)
        except OSError:
            break
        if not data:
            break
        output += data
        if not answered_runtime and b'runtime (codex / claude-code):' in output:
            os.write(master, b'codex\\n')
            answered_runtime = True
        if not answered_approval and b'(native / auto):' in output:
            os.write(master, b'native\\n')
            answered_approval = True
else:
    os.kill(pid, 9)
_, status = os.waitpid(pid, 0)
os.close(master)
sys.stdout.write(output.decode())
sys.exit(os.waitstatus_to_exitcode(status))
`;
  const result = spawnSync('python3', ['-c', script, path.join(f.root, 'bin/setup')], { env: f.env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.equal(loadSettings(f.env).runtime, 'codex');
  assert.equal(loadSettings(f.env).approvals.codex, 'native');
  assert.deepEqual(f.calls(), []);
});

test('conflicting flags and protected configuration paths fail before setup mutations', t => {
  const f = fixture(t);
  for (const args of [
    ['--runtime', 'codex', '--runtime', 'claude-code'],
    ['--runtime', 'codex', '--codex-approvals', 'native', '--codex-approvals', 'auto'],
    ['--runtime', 'codex', '--codex-approvals', 'native', '--seat', '__proto__=codex'],
  ]) assert.equal(f.run('bin/setup', args).status, 1);
  fs.mkdirSync(f.env.OPENRIG_TEAMS_CONFIG);
  fs.mkdirSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'config.env'));
  const result = f.run('bin/setup', ['--runtime', 'codex', '--codex-approvals', 'native']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /regular configuration file/);
  assert.equal(fs.existsSync(path.join(f.root, 'agents/shared')), false);
});
