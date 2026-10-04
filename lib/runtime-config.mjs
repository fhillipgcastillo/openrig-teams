import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const members = {
  lead: ['lead'], pm: ['pm'], fe: ['builder', 'reviewer', 'tester'],
  be: ['builder', 'reviewer', 'tester'], devops: ['operator'],
};
const runtimes = ['codex', 'claude-code'];
const approvals = ['native', 'auto'];

function object(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
  }
}

function choice(value, values, label) {
  if (!values.includes(value)) throw new Error(`${label} must be ${values.join(' or ')}`);
}

export function configDir(env = process.env) {
  const base = env.XDG_CONFIG_HOME || (env.HOME && path.join(env.HOME, '.config'));
  if (!env.OPENRIG_TEAMS_CONFIG && !base) throw new Error('Set HOME or OPENRIG_TEAMS_CONFIG');
  return path.resolve(env.OPENRIG_TEAMS_CONFIG || path.join(base, 'openrig-teams'));
}

export function validateSettings(settings) {
  object(settings, 'settings', ['version', 'runtime', 'approvals', 'seats']);
  if (settings.version !== 1) throw new Error('settings.version must be 1');
  choice(settings.runtime, runtimes, 'settings.runtime');
  object(settings.approvals, 'approvals', runtimes);
  for (const runtime of runtimes) choice(settings.approvals[runtime], approvals, `${runtime} approval`);
  const seats = Object.entries(members).flatMap(([team, ids]) => ids.map(id => `${team}.${id}`));
  object(settings.seats, 'seats', seats);
  for (const [seat, override] of Object.entries(settings.seats)) {
    object(override, seat, ['runtime', 'approval']);
    if ('runtime' in override) choice(override.runtime, runtimes, `${seat} runtime`);
    if ('approval' in override) choice(override.approval, approvals, `${seat} approval`);
  }
  return settings;
}

export function loadSettings(env = process.env) {
  const file = path.join(configDir(env), 'runtime.json');
  try { return validateSettings(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch (error) { throw new Error(`Cannot load ${file}: ${error.message}. Configure with bin/setup.`); }
}

export function resolveSeat(settings, team, member) {
  if (!Object.hasOwn(members, team) || !members[team].includes(member)) throw new Error(`Unknown seat: ${team}.${member}`);
  const override = settings.seats[`${team}.${member}`] || {};
  const runtime = override.runtime || settings.runtime;
  return { runtime, approval: override.approval || settings.approvals[runtime] };
}

export function executablePath(name, env = process.env) {
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    const file = path.resolve(dir || '.', name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch {}
  }
  throw new Error(`${name} is not executable on PATH; install/configure the selected CLI first`);
}

export function findOpenRigPackage(env = process.env) {
  let dir = path.dirname(fs.realpathSync(executablePath('rig', env)));
  while (true) {
    const shared = path.join(dir, 'daemon/specs/agents/shared');
    if (fs.existsSync(shared) && fs.statSync(shared).isDirectory()) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Cannot locate OpenRig shared resources from rig on PATH');
    dir = parent;
  }
}

export function codexProfilePath(env = process.env) {
  if (!env.CODEX_HOME && !env.HOME) throw new Error('Set HOME or CODEX_HOME');
  return path.resolve(env.CODEX_HOME || path.join(env.HOME, '.codex'), 'openrig-auto.config.toml');
}

export function writeAtomic(file, contents) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
