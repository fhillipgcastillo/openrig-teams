import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { configDir, loadSettings, validateSettings, resolveSeat, members, executablePath, findOpenRigPackage, codexProfilePath, writeAtomic } from './runtime-config.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const usage = 'bin/setup [--runtime codex|claude-code] [--codex-approvals native|auto] [--claude-approvals native|auto] [--seat TEAM.MEMBER=RUNTIME] [--seat-approval TEAM.MEMBER=native|auto] [--plan]';

function parse(args) {
  const options = { seats: {}, approvals: {}, plan: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--plan') { options.plan = true; continue; }
    if (flag === '--help' || flag === '-h') { options.help = true; continue; }
    if (!['--runtime', '--codex-approvals', '--claude-approvals', '--seat', '--seat-approval'].includes(flag)) throw new Error(`Unknown option ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--runtime') {
      if (options.runtime && options.runtime !== value) throw new Error(`Conflicting ${flag}`);
      options.runtime = value;
    } else if (flag.endsWith('-approvals')) {
      const runtime = flag === '--codex-approvals' ? 'codex' : 'claude-code';
      if (options.approvals[runtime] && options.approvals[runtime] !== value) throw new Error(`Conflicting ${flag}`);
      options.approvals[runtime] = value;
    }
    else {
      const [seat, selected, extra] = value.split('=');
      if (!seat || !selected || extra !== undefined) throw new Error(`Expected TEAM.MEMBER=VALUE for ${flag}`);
      const [team, member] = seat.split('.');
      if (!Object.hasOwn(members, team) || !members[team].includes(member) || seat !== `${team}.${member}`) throw new Error(`Unknown seat: ${seat}`);
      const key = flag === '--seat' ? 'runtime' : 'approval';
      options.seats[seat] ||= {};
      if (options.seats[seat][key] && options.seats[seat][key] !== selected) throw new Error(`Conflicting ${flag} for ${seat}`);
      options.seats[seat][key] = selected;
    }
  }
  return options;
}

async function ask(label, allowed) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(`Choose ${label} explicitly; ${usage}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const value = (await rl.question(`${label} (${allowed.join(' / ')}): `)).trim();
    if (!allowed.includes(value)) throw new Error(`Choose ${allowed.join(' or ')} for ${label}`);
    return value;
  } finally { rl.close(); }
}

async function settingsFor(options) {
  const existing = fs.existsSync(path.join(configDir(), 'runtime.json'));
  const settings = existing ? structuredClone(loadSettings()) : {
    version: 1, runtime: options.runtime || await ask('runtime', ['codex', 'claude-code']),
    approvals: { codex: 'native', 'claude-code': 'native' }, seats: {},
  };
  if (options.runtime) settings.runtime = options.runtime;
  Object.assign(settings.approvals, options.approvals);
  for (const [seat, override] of Object.entries(options.seats)) settings.seats[seat] = { ...settings.seats[seat], ...override };
  validateSettings(settings);
  const selected = new Set(Object.entries(members).flatMap(([team, ids]) => ids.map(id => resolveSeat(settings, team, id).runtime)));
  if (!existing) {
    for (const runtime of selected) {
      if (!(runtime in options.approvals)) settings.approvals[runtime] = await ask(`${runtime} approvals: native keeps ordinary prompts; auto uses the CLI reviewer`, ['native', 'auto']);
    }
  }
  return validateSettings(settings);
}

function statOrMissing(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function checkDirectory(file) {
  let dir = file;
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Cannot create directory ${file}`);
    dir = parent;
  }
  if (!fs.statSync(dir).isDirectory()) throw new Error(`Not a directory: ${dir}`);
}

function preflight(settings) {
  const packageRoot = findOpenRigPackage();
  const seats = Object.entries(members).flatMap(([team, ids]) => ids.map(id => ({ seat: `${team}.${id}`, ...resolveSeat(settings, team, id) })));
  for (const runtime of new Set(seats.map(seat => seat.runtime))) executablePath(runtime === 'codex' ? 'codex' : 'claude');
  const links = [[path.join(root, 'agents/shared'), path.join(packageRoot, 'daemon/specs/agents/shared')]];
  for (const team of Object.keys(members)) links.push([path.join(root, 'rigs', team, 'CULTURE.md'), '../../culture/CULTURE.md']);
  for (const [destination] of links) {
    const stat = statOrMissing(destination);
    if (stat && !stat.isSymbolicLink()) throw new Error(`Preserve existing path at ${destination}; expected a setup symlink`);
    checkDirectory(path.dirname(destination));
  }
  const directories = [configDir(), path.join(configDir(), 'projects'), path.join(root, 'homes/lead'), path.join(root, 'homes/pm')];
  for (const directory of directories) checkDirectory(directory);
  for (const name of ['config.env', 'runtime.json']) {
    const file = path.join(configDir(), name);
    const stat = statOrMissing(file);
    if (stat && !stat.isFile()) throw new Error(`Preserve existing path at ${file}; expected a regular configuration file`);
  }
  let profile;
  if (seats.some(seat => seat.runtime === 'codex' && seat.approval === 'auto')) {
    const source = fs.readFileSync(path.join(root, 'profiles/openrig-auto.config.toml'));
    const destination = codexProfilePath();
    const stat = statOrMissing(destination);
    if (stat && (!stat.isFile() || !fs.readFileSync(destination).equals(source))) throw new Error(`Existing Codex profile differs: ${destination}; preserve it and resolve before setup`);
    checkDirectory(path.dirname(destination));
    profile = { source, destination, exists: Boolean(stat) };
  }
  return { seats, links, directories, profile };
}

function apply(settings, plan) {
  for (const directory of plan.directories) fs.mkdirSync(directory, { recursive: true });
  for (const [destination, target] of plan.links) {
    if (statOrMissing(destination)) fs.unlinkSync(destination);
    fs.symlinkSync(target, destination);
  }
  const globalConfig = path.join(configDir(), 'config.env');
  if (!fs.existsSync(globalConfig)) fs.writeFileSync(globalConfig, 'LEAD_MAY_SPAWN=0\n', { flag: 'wx', mode: 0o600 });
  if (plan.profile && !plan.profile.exists) {
    fs.mkdirSync(path.dirname(plan.profile.destination), { recursive: true });
    fs.writeFileSync(plan.profile.destination, plan.profile.source, { flag: 'wx', mode: 0o600 });
  }
  const file = path.join(configDir(), 'runtime.json');
  const contents = `${JSON.stringify(settings, null, 2)}\n`;
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (JSON.stringify(existing) !== JSON.stringify(settings)) writeAtomic(file, contents);
}

export async function setup(args) {
  const options = parse(args);
  if (options.help) { console.log(usage); return; }
  const settings = await settingsFor(options);
  const plan = preflight(settings);
  for (const seat of plan.seats) console.log(`${seat.seat}: ${seat.runtime}, approvals ${seat.approval}`);
  for (const [destination, target] of plan.links) console.log(`${options.plan ? 'would link' : 'link'} ${destination} -> ${target}`);
  if (plan.profile) console.log(`${plan.profile.exists ? 'preserve' : options.plan ? 'would install' : 'install'} ${plan.profile.destination}`);
  console.log(`${options.plan ? 'would save' : 'config'}: ${path.join(configDir(), 'runtime.json')}`);
  if (!options.plan) apply(settings, plan);
  for (const runtime of new Set(plan.seats.map(seat => seat.runtime))) console.log(`Verify authentication: ${runtime === 'codex' ? 'codex login status' : 'claude auth status'}`);
  if (plan.seats.some(seat => seat.runtime === 'claude-code' && seat.approval === 'auto')) console.log('Claude auto is saved after initial seat registration and takes effect on the next resume; setup does not restart seats.');
}
