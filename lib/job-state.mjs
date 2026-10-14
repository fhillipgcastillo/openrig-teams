import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic } from './runtime-config.mjs';
import { demand, JobError } from './job-tools.mjs';

const terminal = new Set(['finished', 'removed', 'detached']);
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function stateDir() {
  return path.resolve(process.env.OPENRIG_TEAMS_STATE || path.join(process.env.XDG_STATE_HOME || path.join(process.env.HOME, '.local/state'), 'openrig-teams'));
}

export function validName(name) {
  demand(typeof name === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(name), 'invalid_name', 'Use a lowercase name of up to 64 letters, digits, and hyphens, beginning with a letter or digit');
  return name;
}

export function jobDir(id) {
  demand(idPattern.test(id), 'invalid_job_id', `Invalid job UUID: ${id}`);
  return path.join(stateDir(), 'jobs', id);
}

export function validateJob(job) {
  demand(job?.version === 1 && idPattern.test(job.id) && path.isAbsolute(job.workspace?.path || '') && path.isAbsolute(job.repo || '') && typeof job.rigName === 'string' && Array.isArray(job.setup) && Array.isArray(job.seats) && Array.isArray(job.dependencies), 'invalid_job', 'Invalid or unsupported job manifest');
  return job;
}

export function readJob(id) {
  const file = path.join(jobDir(id), 'manifest.json');
  demand(fs.existsSync(file), 'job_not_found', `No recorded job ${id}`);
  return validateJob(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function listJobs() {
  const dir = path.join(stateDir(), 'jobs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(id => idPattern.test(id) && fs.existsSync(path.join(dir, id, 'manifest.json'))).map(readJob);
}

export function reserved(job) {
  return !terminal.has(job.lifecycle);
}

export function saveJob(job) {
  validateJob(job);
  fs.mkdirSync(jobDir(job.id), { recursive: true, mode: 0o700 });
  job.updatedAt = new Date().toISOString();
  writeAtomic(path.join(jobDir(job.id), 'manifest.json'), `${JSON.stringify(job, null, 2)}\n`);
  return job;
}

export async function withStateLock(operation) {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const lock = path.join(stateDir(), '.mutation-lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new JobError('state_locked', `Another operation holds ${lock}. If interrupted, inspect its owner.json and running process before explicitly removing that lock.`, 3);
    throw error;
  }
  try {
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), { mode: 0o600 });
    return await operation();
  } finally {
    fs.unlinkSync(path.join(lock, 'owner.json'));
    fs.rmdirSync(lock);
  }
}

export function fleetFile(name) {
  return path.join(stateDir(), 'fleets', `${validName(name)}.json`);
}

export function listFleets() {
  const dir = path.join(stateDir(), 'fleets');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

export function readFleet(name) {
  demand(fs.existsSync(fleetFile(name)), 'fleet_not_found', `No fleet ${name}`);
  const fleet = JSON.parse(fs.readFileSync(fleetFile(name), 'utf8'));
  demand(fleet.version === 1 && Array.isArray(fleet.jobIds), 'invalid_fleet', `Invalid fleet record ${name}`);
  return fleet;
}

export function saveFleet(fleet) {
  fs.mkdirSync(path.dirname(fleetFile(fleet.name)), { recursive: true, mode: 0o700 });
  writeAtomic(fleetFile(fleet.name), `${JSON.stringify(fleet, null, 2)}\n`);
  return fleet;
}
