import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export class JobError extends Error {
  constructor(code, message, exitCode = 2, extra = {}) {
    super(message);
    Object.assign(this, { code, exitCode, ...extra });
  }
}

export function demand(condition, code, message, exitCode = 2, extra = {}) {
  if (!condition) throw new JobError(code, message, exitCode, extra);
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new JobError('command_failed', `${command} ${args.slice(0, 3).join(' ')}: ${result.error?.message || result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`}`, 1);
  return result.stdout.trim();
}

export function git(repo, ...args) {
  return run('git', ['-C', repo, ...args]);
}

export function jsonCommand(args) {
  const output = run('rig', args);
  try { return JSON.parse(output); }
  catch { throw new JobError('invalid_native_response', `rig ${args.join(' ')} did not return JSON`, 1); }
}

export function nativeInventory() {
  const rows = jsonCommand(['ps', '--nodes', '-A', '--full', '--json']);
  demand(Array.isArray(rows) && rows.every(row => row && typeof row.rigName === 'string' && typeof row.nodeId === 'string' && typeof row.rigId === 'string' && typeof row.cwd === 'string'), 'invalid_inventory', 'OpenRig inventory lacks native rig/node/workspace identity; cannot establish workspace availability', 1);
  return rows;
}

export function nativeQueue() {
  const rows = jsonCommand(['queue', 'list', '--all', '--all-rigs', '--full', '--json']);
  demand(Array.isArray(rows), 'invalid_queue', 'OpenRig queue list did not return an array', 1);
  return rows;
}

export function caller() {
  if (!process.env.OPENRIG_NODE_ID && !process.env.OPENRIG_SESSION_NAME && !process.env.RIGGED_SESSION_NAME) return null;
  const response = jsonCommand(['whoami', '--json']);
  const identity = response.identity;
  demand(identity?.nodeId && identity.rigId, 'invalid_identity', 'OpenRig did not resolve the calling seat', 3);
  return identity;
}

export function workspaceRoot(target) {
  const real = fs.realpathSync(target);
  return fs.realpathSync(git(real, 'rev-parse', '--show-toplevel'));
}

export function prospectivePath(target) {
  const resolved = path.resolve(target);
  if (fs.existsSync(resolved)) return fs.realpathSync(resolved);
  const parent = path.dirname(resolved);
  return path.join(parent === resolved ? parent : prospectivePath(parent), path.basename(resolved));
}

export function tagsOf(item) {
  if (Array.isArray(item.tags)) return item.tags;
  if (typeof item.tags !== 'string') return [];
  try { const tags = JSON.parse(item.tags); return Array.isArray(tags) ? tags : []; }
  catch { return item.tags.split(','); }
}

export function queueFor(job, rows = nativeQueue()) {
  return rows.filter(item => tagsOf(item).includes(`job:${job.id}`));
}

export function occupied(workspacePath, job = null, rig = null) {
  throw new JobError('workspace_occupied', `Workspace ${workspacePath} belongs to ${job ? `job ${job.name} (${job.id}), ` : ''}rig ${rig?.rigName || job?.rigName || 'unknown'}. Use the existing rig or request a separate worktree job. Nothing was started.`, 3, {
    conflict: { workspacePath, jobId: job?.id || null, rigName: rig?.rigName || job?.rigName || null, options: ['use-existing-rig', 'request-worktree-job'] },
  });
}

export function queueWrite(operation, input, cliArgs) {
  const identity = caller();
  if (identity) {
    const env = { ...process.env, OPENRIG_SESSION_NAME: process.env.OPENRIG_SESSION_NAME || process.env.RIGGED_SESSION_NAME || identity.sessionName || identity.canonicalSessionName };
    demand(env.OPENRIG_SESSION_NAME, 'invalid_identity', 'Native identity has no canonical session name', 3);
    return JSON.parse(run('rig', cliArgs, { env }));
  }
  return JSON.parse(run('node', [path.join(root, 'lib/job-native-queue.mjs'), operation, JSON.stringify(input)]));
}
