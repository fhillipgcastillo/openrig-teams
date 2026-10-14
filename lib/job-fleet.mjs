import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, demand, caller, nativeInventory, jsonCommand, queueWrite, nativeQueue, run } from './job-tools.mjs';
import { stateDir, validName, readFleet, saveFleet, readJob, listFleets, withStateLock } from './job-state.mjs';
import { resolveRig, renderRig } from './job-rig.mjs';
import { applyPermissions, verifySeats } from './job-lifecycle.mjs';
import { observeJob } from './job-coordination.mjs';
import { parseOptions, printResult, printError } from './job-cli.mjs';

function authorizeFleet(fleet) {
  const identity = caller();
  if (identity) demand(fleet.manager?.nodeId === identity.nodeId && fleet.manager.rigId === identity.rigId, 'wrong_fleet_caller', 'Only the selected native manager seat or a human-directed shell may change this fleet', 3);
}

function managerSeat(address) {
  const rows = nativeInventory().filter(node => node.canonicalSessionName === address);
  demand(rows.length === 1, 'manager_seat_not_found', 'Select exactly one existing native seat address', 3);
  return { rigId: rows[0].rigId, nodeId: rows[0].nodeId, address };
}

function notifyManager(fleet) {
  const id = `fleet-${fleet.name}-assignment`;
  if (nativeQueue().some(item => (item.qitemId || item.qitem_id) === id)) return;
  const body = `Coordinate fleet ${fleet.name}. Tools: ${root}/bin/rig-fleet status ${fleet.name}; ${root}/bin/rig-job list/status/tell/answer. Inspect fleet membership and job-tagged native queues, relay human decisions and evidence, and respect dependency gates. Do not replace job leads or approve seat permission prompts. Release ends coordination without stopping sessions.`;
  const input = { qitemId: id, destinationSession: fleet.manager.address, tags: [`fleet:${fleet.name}`, 'kind:assignment'], body, summary: `Coordinate fleet ${fleet.name}` };
  return queueWrite('create', input, ['queue', 'create', '--id', id, '--destination', input.destinationSession, '--tags', input.tags.join(','), '--body', body, '--summary', input.summary, '--json']);
}

async function upFleet(fleet, plan) {
  authorizeFleet(fleet);
  demand(!caller(), 'human_fleet_launch_required', 'Fleet manager launch is a human-directed operation', 3);
  const inventory = nativeInventory();
  if (fleet.instance) {
    const nodes = inventory.filter(n => n.rigName === fleet.instance.rigName);
    if (nodes.length) {
      verifySeats(fleet.instance, inventory);
      if (plan) return { plan: true, fleet, native: nodes };
      demand(nodes.some(n => n.sessionStatus === 'running'), 'fleet_stopped', 'Fleet seat is registered but stopped; resume it through native OpenRig lifecycle rather than creating a replacement', 3);
      fleet.manager = managerSeat(fleet.instance.seats[0].address);
      fleet.instance.launched = true;
      fleet.coordinating = true;
      saveFleet(fleet);
      applyPermissions(fleet.instance);
      notifyManager(fleet);
      return fleet;
    }
    demand(!fleet.instance.launched, 'fleet_instance_missing', 'Previously launched fleet is missing; inspect native state rather than replacing it', 3);
  }
  const resolution = await resolveRig({ repo: root, config: {} }, { template: path.join(root, 'rigs/fleet/rig.yaml'), fleet: true });
  const instanceId = fleet.instance?.id || randomUUID();
  const folder = path.join(stateDir(), 'fleets', fleet.name);
  const rigName = fleet.instance?.rigName || `fleet-${fleet.name}-${instanceId}`;
  const instance = fleet.instance || { id: instanceId, rigName, rigId: null, workspace: { path: path.join(folder, 'home'), mode: 'existing', owned: false }, seats: resolution.seats.map(s => ({ ...s, address: `${s.pod}-${s.member}@${rigName}` })), specPath: path.join(folder, 'rig.yaml'), launched: false };
  if (plan) return { plan: true, instance, notice: 'Optional manager seat only; no project rigs are changed' };
  fs.mkdirSync(instance.workspace.path, { recursive: true, mode: 0o700 });
  if (!fleet.instance) {
    fleet.instance = instance;
    await renderRig(instance, resolution);
    saveFleet(fleet);
  }
  run('rig', ['up', instance.specPath, '--cwd', instance.workspace.path, '--yes']);
  verifySeats(instance);
  instance.launched = true;
  fleet.manager = managerSeat(instance.seats[0].address);
  fleet.coordinating = true;
  saveFleet(fleet);
  applyPermissions(instance);
  notifyManager(fleet);
  return fleet;
}

export async function fleetCommand(args) {
  const usage = 'rig-fleet create|up|status|release NAME [--plan] [--json]; add NAME JOB_ID; take NAME --seat ADDRESS; handover NAME --source SOURCE';
  if (!args.length || ['--help', '-h', 'help'].includes(args[0])) { console.log(usage); return; }
  const surface = { create: ['json'], up: ['plan', 'json'], add: ['json'], status: ['json'], take: ['seat', 'plan', 'json'], release: ['plan', 'json'], handover: ['source', 'plan', 'json'] };
  const [command, ...rest] = args;
  const { options, positional } = parseOptions(command, rest, surface);
  demand(positional.length === (command === 'add' ? 2 : 1), 'invalid_arguments', usage);
  const name = validName(positional[0]);
  const operation = async () => {
    if (command === 'create') {
      demand(!listFleets().some(f => f.name === name), 'fleet_exists', `Fleet ${name} already exists`, 3);
      return saveFleet({ version: 1, name, jobIds: [], manager: null, coordinating: false });
    }
    const fleet = readFleet(name);
    if (command === 'status') return { fleet, jobs: fleet.jobIds.map(id => observeJob(readJob(id))), manager: fleet.manager ? (() => {
      try { return { state: 'observed', nodes: nativeInventory().filter(n => n.nodeId === fleet.manager.nodeId) }; }
      catch (error) { return { state: 'unknown', error: error.message }; }
    })() : null };
    authorizeFleet(fleet);
    if (command === 'up') return upFleet(fleet, options.plan);
    if (command === 'add') {
      readJob(positional[1]);
      demand(!listFleets().some(f => f.name !== name && f.jobIds.includes(positional[1])), 'job_already_in_fleet', 'A job belongs to at most one fleet', 3);
      fleet.jobIds = [...new Set([...fleet.jobIds, positional[1]])];
    }
    if (command === 'take') {
      demand(options.seat, 'seat_required', 'Supply --seat ADDRESS');
      const manager = managerSeat(options.seat);
      demand(!fleet.manager || fleet.manager.nodeId === manager.nodeId, 'manager_already_selected', 'Fleet has a stable manager seat; use native handover for its occupant', 3);
      const identity = caller();
      demand(!identity || identity.nodeId === manager.nodeId, 'not_manager_occupant', 'Selecting a seat does not attach the calling agent to it', 3);
      if (options.plan) return { plan: true, manager };
      fleet.manager = manager;
      fleet.coordinating = true;
      saveFleet(fleet);
      notifyManager(fleet);
    }
    if (command === 'release') {
      if (options.plan) return { plan: true, action: 'end-coordination-assignment', fleet };
      fleet.coordinating = false;
    }
    if (command === 'handover') {
      demand(fleet.manager && options.source, 'handover_source_required', 'Select a manager and supply --source fresh|discovered:ID|fork:ID|rebuild');
      return jsonCommand(['seat', 'handover', fleet.manager.address, '--source', options.source, '--reason', `Fleet ${name} manager handover`, ...(options.plan ? ['--dry-run'] : []), '--json']);
    }
    return saveFleet(fleet);
  };
  const result = command === 'status' || options.plan ? await operation() : await withStateLock(operation);
  printResult(result, options.json);
}

export async function fleetMain(args) {
  try { await fleetCommand(args); }
  catch (error) { printError(error, args.includes('--json')); }
}
