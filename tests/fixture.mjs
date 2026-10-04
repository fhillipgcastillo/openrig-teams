import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findOpenRigPackage } from '../lib/runtime-config.mjs';

const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const installedPackage = findOpenRigPackage();

export function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openrig-teams-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'teams');
  fs.mkdirSync(root);
  for (const name of ['bin', 'lib', 'rigs', 'agents', 'culture', 'profiles']) {
    fs.cpSync(path.join(source, name), path.join(root, name), {
      recursive: true, filter: file => !fs.lstatSync(file).isSymbolicLink() && !/\/rig\.[^/]+\.yaml$/.test(file),
    });
  }
  const packageRoot = path.join(temporary, 'package');
  const commands = path.join(temporary, 'commands');
  fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'daemon/specs/agents'), { recursive: true });
  fs.symlinkSync(path.join(installedPackage, 'daemon/specs/agents/shared'), path.join(packageRoot, 'daemon/specs/agents/shared'));
  fs.symlinkSync(path.join(installedPackage, 'daemon/dist'), path.join(packageRoot, 'daemon/dist'));
  fs.symlinkSync(path.join(installedPackage, 'node_modules'), path.join(packageRoot, 'node_modules'));
  fs.mkdirSync(commands);
  const env = {
    ...process.env,
    HOME: path.join(temporary, 'home'), CODEX_HOME: path.join(temporary, 'codex'),
    OPENRIG_TEAMS_CONFIG: path.join(temporary, 'config'), XDG_CONFIG_HOME: '',
    PATH: `${commands}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
    TEST_LOG: path.join(temporary, 'calls.jsonl'), TEST_INVENTORY: '[]', OPENRIG_SESSION_NAME: '',
  };
  fs.mkdirSync(env.HOME);
  const executable = (file, body) => {
    fs.writeFileSync(file, `#!${process.execPath}\n${body}\n`);
    fs.chmodSync(file, 0o755);
  };
  const log = `require('node:fs').appendFileSync(process.env.TEST_LOG, JSON.stringify([require('node:path').basename(process.argv[1]), ...process.argv.slice(2)])+'\\n');`;
  executable(path.join(packageRoot, 'bin/rig'), `${log}
const args=process.argv.slice(2);
if (args[0]==='ps') process.stdout.write(process.env.TEST_INVENTORY);
if (args[0]===process.env.TEST_FAIL_COMMAND) {console.error('mock daemon refusal');process.exit(1);}
if (args[0]==='seat' && process.env.TEST_FAIL_MODE && args.includes(process.env.TEST_FAIL_MODE)) {console.error('mock unsupported mode');process.exit(1);}
`);
  fs.symlinkSync(path.join(packageRoot, 'bin/rig'), path.join(commands, 'rig'));
  for (const cli of ['codex', 'claude']) executable(path.join(commands, cli), `${log}
if (process.env.TEST_FAIL_PROFILE) {console.error('mock profile loader refusal');process.exit(1);}`);
  function run(file, args = [], overrides = {}) {
    return spawnSync(path.join(root, file), args, { env: { ...env, ...overrides }, encoding: 'utf8', timeout: 15000 });
  }
  function settings(value = {}) {
    fs.mkdirSync(env.OPENRIG_TEAMS_CONFIG, { recursive: true });
    const config = { version: 1, runtime: 'codex', approvals: { codex: 'native', 'claude-code': 'native' }, seats: {}, ...value };
    fs.writeFileSync(path.join(env.OPENRIG_TEAMS_CONFIG, 'runtime.json'), JSON.stringify(config));
    return config;
  }
  function calls() {
    return fs.existsSync(env.TEST_LOG) ? fs.readFileSync(env.TEST_LOG, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  }
  function profile() {
    fs.mkdirSync(env.CODEX_HOME, { recursive: true });
    fs.copyFileSync(path.join(root, 'profiles/openrig-auto.config.toml'), path.join(env.CODEX_HOME, 'openrig-auto.config.toml'));
  }
  return { temporary, root, env, commands, packageRoot, run, settings, calls, profile };
}
