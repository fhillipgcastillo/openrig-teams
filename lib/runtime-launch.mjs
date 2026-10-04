import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadSettings, resolveSeat, members, executablePath, findOpenRigPackage, codexProfilePath, writeAtomic } from './runtime-config.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const usage = 'rig-runtime check TEAM... | render TEAM NAME OUTPUT | permissions TEAM NAME [--plan]';

function run(command, args, timeout = 10000) {
  const result = spawnSync(executablePath(command), args, { encoding: 'utf8', timeout });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`}`);
  return result.stdout;
}

async function template(team) {
  if (!Object.hasOwn(members, team)) throw new Error(`Unknown team: ${team}`);
  const packageRoot = findOpenRigPackage();
  const yaml = createRequire(path.join(packageRoot, 'package.json'))('yaml');
  const { RigSpecSchema } = await import(pathToFileURL(path.join(packageRoot, 'daemon/dist/domain/rigspec-schema.js')));
  const spec = yaml.parse(fs.readFileSync(path.join(root, 'rigs', team, 'rig.yaml'), 'utf8'));
  const validation = RigSpecSchema.validate(spec);
  if (!validation.valid) throw new Error(`Invalid ${team} template: ${validation.errors.join('; ')}`);
  const settings = loadSettings();
  const seats = spec.pods.flatMap(pod => pod.members.map(member => ({
    pod: pod.id, member: member.id, ...resolveSeat(settings, team, member.id),
  })));
  if (seats.length !== members[team].length || new Set(seats.map(seat => seat.member)).size !== seats.length) throw new Error(`Unexpected members in ${team} template`);
  return { yaml, spec, seats, RigSpecSchema };
}

function checkPrerequisites(seats) {
  for (const runtime of new Set(seats.map(seat => seat.runtime))) executablePath(runtime === 'codex' ? 'codex' : 'claude');
  if (seats.some(seat => seat.runtime === 'codex' && seat.approval === 'auto')) {
    const destination = codexProfilePath();
    const source = fs.readFileSync(path.join(root, 'profiles/openrig-auto.config.toml'));
    if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(source)) throw new Error(`Missing or differing Codex profile ${destination}; run bin/setup or resolve the conflict`);
    run('codex', ['-p', 'openrig-auto', 'mcp', 'list']);
  }
}

function rigName(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name || '')) throw new Error(`Invalid rig name: ${name}`);
}

function render(data, name, output) {
  data.spec.name = name;
  for (const pod of data.spec.pods) {
    for (const member of pod.members) {
      const seat = data.seats.find(seat => seat.pod === pod.id && seat.member === member.id);
      member.runtime = seat.runtime;
      delete member.codex_config_profile;
      if (seat.runtime === 'codex' && seat.approval === 'auto') member.codex_config_profile = 'openrig-auto';
    }
  }
  const validation = data.RigSpecSchema.validate(data.spec);
  if (!validation.valid) throw new Error(`Invalid generated spec: ${validation.errors.join('; ')}`);
  writeAtomic(output, data.yaml.stringify(data.spec));
}

function permissions(seats, name, plan) {
  if (!plan) {
    const inventory = JSON.parse(run('rig', ['ps', '--nodes', '--rig', name, '--json']));
    if (!Array.isArray(inventory)) throw new Error('Expected a rig node inventory array');
    for (const seat of seats) {
      const address = `${seat.pod}-${seat.member}@${name}`;
      const matching = inventory.filter(node => node && node.canonicalSessionName === address && node.rigName === name);
      if (matching.length !== 1 || matching[0].runtime !== seat.runtime) throw new Error(`Stored seat ${address} does not match configured runtime ${seat.runtime}; runtime changes require deliberate rig recreation`);
    }
  }
  let applied = 0;
  for (const seat of seats.filter(seat => seat.runtime === 'claude-code')) {
    const address = `${seat.pod}-${seat.member}@${name}`;
    const mode = seat.approval === 'auto' ? 'auto' : 'floor';
    if (plan) console.log(`After registration: rig seat set-permissions ${address} --mode ${mode} --reason "openrig-teams saved ${seat.approval} approval choice"`);
    else {
      try { run('rig', ['seat', 'set-permissions', address, '--mode', mode, '--reason', `openrig-teams saved ${seat.approval} approval choice`]); }
      catch (error) { throw new Error(`${error.message}; ${applied} preceding Claude selections saved. The rig may already exist; no restart performed.`); }
      applied++;
    }
  }
  if (seats.some(seat => seat.runtime === 'claude-code')) console.log('Claude approval selections affect the next launch. Initial up uses ordinary OpenRig permissions; resume applies saved choices before launch.');
}

export async function runtimeCommand(args) {
  const [command, team, name, output] = args;
  if (command === '--help' || command === '-h') { console.log(usage); return; }
  if (command === 'check') {
    if (args.length < 2) throw new Error(usage);
    const seats = [];
    for (const requested of args.slice(1)) seats.push(...(await template(requested)).seats);
    checkPrerequisites(seats);
    const runtimes = new Set(seats.map(seat => seat.runtime));
    console.log(runtimes.size === 2 ? 'both' : [...runtimes][0]);
    return;
  }
  if (!['render', 'permissions'].includes(command)) throw new Error(usage);
  if (command === 'render' && args.length !== 4) throw new Error(usage);
  if (command === 'permissions' && (args.length < 3 || args.length > 4 || (output && output !== '--plan'))) throw new Error(usage);
  rigName(name);
  const data = await template(team);
  if (command === 'render') {
    checkPrerequisites(data.seats);
    const destination = path.resolve(output);
    if (path.dirname(destination) !== path.join(root, 'rigs', team) || !/^rig\..+\.yaml$/.test(path.basename(destination))) throw new Error('Generated specs must use rig.<name>.yaml beside their team template');
    render(data, name, destination);
  } else permissions(data.seats, name, output === '--plan');
}
