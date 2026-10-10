import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { configDir, writeAtomic } from './runtime-config.mjs';
import { demand, git, run, root, nativeInventory, workspaceRoot, prospectivePath, occupied, caller } from './job-tools.mjs';
import { listJobs, listFleets, reserved, saveJob, jobDir } from './job-state.mjs';
import { loadProject, targetWorkspace, checkProfile, profileHook, copyProfileFiles } from './job-project.mjs';
import { resolveRig, renderRig, checkArtifacts, excludeArtifacts, snapshotInstructions, verifyInstructions, restoreInstructions } from './job-rig.mjs';
import { deliverBrief } from './job-coordination.mjs';
import { dependenciesFor, checkDependencies, matchingHandoff } from './job-dependencies.mjs';

export function guardLifecycle() {
  const identity = caller();
  if (!identity) return;
  const config = path.join(configDir(), 'config.env');
  const allowed = fs.existsSync(config) && /^FLEET_MAY_SPAWN=1\s*$/m.test(fs.readFileSync(config, 'utf8'));
  demand(allowed && listFleets().some(f => f.coordinating && f.manager?.nodeId === identity.nodeId && f.manager.rigId === identity.rigId), 'spawn_not_allowed', 'Only a human-directed shell or explicitly authorized current fleet seat may change job lifecycle', 3);
}

function rowWorkspace(row) {
  if (!fs.existsSync(row.cwd)) return prospectivePath(row.cwd);
  try { return workspaceRoot(row.cwd); }
  catch { return prospectivePath(row.cwd); }
}

export function available(workspace, id = null, inventory = nativeInventory()) {
  const owner = listJobs().find(job => reserved(job) && job.id !== id && job.workspace.path === workspace.path);
  if (owner) occupied(workspace.path, owner);
  const own = id ? listJobs().find(job => job.id === id) : null;
  const other = inventory.find(row => row.rigName !== own?.rigName && rowWorkspace(row) === workspace.path);
  if (other) occupied(workspace.path, null, other);
  return inventory;
}

function verifyWorkspace(job) {
  demand(fs.existsSync(job.workspace.path) && workspaceRoot(job.workspace.path) === job.workspace.path && fs.realpathSync(git(job.workspace.path, 'rev-parse', '--path-format=absolute', '--git-common-dir')) === job.commonDir, 'workspace_identity_changed', 'Recorded workspace missing or no longer belongs to this repository', 3);
  const branch = git(job.workspace.path, 'branch', '--show-current') || null;
  demand(branch === job.branch, 'workspace_branch_changed', 'Workspace branch changed; restore the recorded branch before continuing', 3);
}

export function verifySeats(job, inventory = nativeInventory(), partial = false) {
  const nodes = inventory.filter(row => row.rigName === job.rigName);
  demand(partial ? nodes.length > 0 && nodes.length <= job.seats.length && nodes.every(n => job.seats.some(s => s.address === n.canonicalSessionName)) : nodes.length === job.seats.length, 'rig_inventory_mismatch', `Expected ${job.seats.length} seats for ${job.rigName}, found ${nodes.length}`, 3);
  for (const seat of job.seats) {
    const matches = nodes.filter(row => row.canonicalSessionName === seat.address);
    if (partial && matches.length === 0) continue;
    demand(matches.length === 1 && matches[0].runtime === seat.runtime && rowWorkspace(matches[0]) === job.workspace.path, 'seat_identity_mismatch', `Native seat ${seat.address} does not match its recorded runtime/workspace`, 3);
    demand(!seat.nodeId || seat.nodeId === matches[0].nodeId, 'seat_identity_changed', `Native node identity changed for ${seat.address}`, 3);
    demand(!job.rigId || job.rigId === matches[0].rigId, 'rig_identity_changed', 'Native rig identity changed', 3);
    seat.nodeId = matches[0].nodeId;
    job.rigId = matches[0].rigId;
  }
  return nodes;
}

export function applyPermissions(job) {
  verifySeats(job);
  for (const seat of job.seats.filter(s => s.runtime === 'claude-code')) run('rig', ['seat', 'set-permissions', seat.address, '--mode', seat.approval === 'auto' ? 'auto' : 'floor', '--reason', 'openrig-teams recorded job approval choice']);
}

function checkpoint(job, step, effect) {
  if (job.setup.includes(step)) return;
  job.attempt = step;
  saveJob(job);
  const result = effect();
  demand(!(result instanceof Promise), 'async_checkpoint', 'Synchronous checkpoint received async operation');
  job.setup.push(step);
  job.attempt = null;
  saveJob(job);
}

async function completeSetup(job) {
  checkProfile(job);
  available(job.workspace, job.id);
  if (job.workspace.owned) {
    if (!job.setup.includes('branch')) {
      let exists = false;
      try { git(job.repo, 'show-ref', '--verify', '--quiet', `refs/heads/${job.branch}`); exists = true; } catch {}
      if (exists) {
        demand(job.attempt === 'branch' && git(job.repo, 'rev-parse', job.branch) === job.baseCommit, 'ambiguous_branch', 'Existing branch cannot be safely attributed to interrupted creation', 3);
        job.setup.push('branch'); job.attempt = null; saveJob(job);
      } else checkpoint(job, 'branch', () => git(job.repo, 'branch', job.branch, job.baseCommit));
    }
    if (!job.setup.includes('worktree')) {
      if (fs.existsSync(job.workspace.path)) {
        demand(job.attempt === 'worktree', 'ambiguous_worktree', 'Existing path was not created by a recorded worktree attempt', 3);
        verifyWorkspace(job);
        job.setup.push('worktree'); job.attempt = null; saveJob(job);
      } else checkpoint(job, 'worktree', () => {
        if (!profileHook(job, 'profile_create_worktree')) git(job.repo, 'worktree', 'add', job.workspace.path, job.branch);
      });
    }
  }
  verifyWorkspace(job);
  available(job.workspace, job.id);
  await checkArtifacts(job.workspace.path, job.seats);
  if (job.attempt === 'prepared' && !job.preparedRepeatable) demand(false, 'ambiguous_preparation', 'Preparation was interrupted and not declared repeatable; inspect the workspace and explicitly restore/complete preparation before retry', 3);
  checkpoint(job, 'prepared', () => {
    if (job.workspace.owned) copyProfileFiles(job);
    profileHook(job, job.workspace.owned ? 'profile_prepare_worktree' : 'profile_prepare_existing_workspace');
    excludeArtifacts(job);
    snapshotInstructions(job);
  });
  if (!job.setup.includes('rendered')) {
    const resolution = JSON.parse(fs.readFileSync(path.join(jobDir(job.id), 'resolution.json'), 'utf8'));
    await renderRig(job, resolution);
    job.setup.push('rendered'); saveJob(job);
  }
  checkDependencies(job);
  const before = available(job.workspace, job.id);
  const found = before.filter(node => node.rigName === job.rigName);
  if (!job.setup.includes('launched')) {
    if (found.length) {
      demand(job.attempt === 'launched', 'rig_name_collision', 'Rig exists without a recorded launch attempt; no adoption performed', 3);
      verifySeats(job, before);
    } else {
      demand(job.attempt !== 'launched', 'ambiguous_launch', 'Previous launch outcome is ambiguous; inspect native state before retrying, or finish this failed job explicitly', 3);
      job.attempt = 'launched'; saveJob(job);
      run('rig', ['up', job.specPath, '--cwd', job.workspace.path, '--yes']);
      verifySeats(job);
    }
    await verifyInstructions(job);
    job.setup.push('launched'); job.attempt = null; saveJob(job);
  } else verifySeats(job, before);
  checkpoint(job, 'permissions', () => applyPermissions(job));
  checkpoint(job, 'briefed', () => deliverBrief(job));
  job.lifecycle = 'running';
  job.error = null;
  if (job.outcome === 'unassigned' && job.brief) job.outcome = 'working';
  return saveJob(job);
}

export async function startJob(projectName, name, options) {
  guardLifecycle();
  demand(/^[a-z0-9][a-z0-9-]{0,63}$/.test(name), 'invalid_name', 'Use a lowercase job name (letters/digits/hyphens, up to 64 characters)');
  demand(Boolean(options.workspace) !== Boolean(options.worktree), 'workspace_mode_required', 'Choose --workspace PATH or --worktree');
  demand(!options.workspace || (!options.branch && !options.base), 'existing_branch_owned_by_user', '--branch and --base are only valid with --worktree');
  const project = loadProject(projectName, options);
  const workspace = targetWorkspace(project, options, name);
  const inventory = available(workspace);
  demand(!listJobs().some(j => j.commonDir === project.commonDir && j.name === name && reserved(j)), 'job_name_reserved', `Unfinished job ${name} already exists`, 3);
  const branch = workspace.owned ? options.branch || `feature/${name}` : git(workspace.path, 'branch', '--show-current') || null;
  if (workspace.owned) {
    git(project.repo, 'check-ref-format', '--branch', branch);
    let existing = false;
    try { git(project.repo, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`); existing = true; } catch {}
    demand(!existing, 'branch_exists', `Branch ${branch} already exists; choose another branch`, 3);
    demand(!fs.existsSync(workspace.path), 'workspace_path_exists', `Worktree path already exists: ${workspace.path}`, 3);
  }
  const baseCommit = git(workspace.owned ? project.repo : workspace.path, 'rev-parse', '--verify', `${workspace.owned ? project.base : 'HEAD'}^{commit}`);
  const resolution = await resolveRig(project, options);
  await checkArtifacts(workspace.owned ? project.repo : workspace.path, resolution.seats, workspace.owned ? baseCommit : null);
  const dependencies = dependenciesFor(options.dependsOn || [], project.commonDir, workspace.path);
  const id = randomUUID();
  const rigName = `job-${name}-${id}`;
  demand(!inventory.some(row => row.rigName === rigName), 'rig_name_collision', 'Generated rig identity is already in use', 3);
  const job = {
    version: 1, id, project: projectName, repo: project.repo, commonDir: project.commonDir, name, branch, baseCommit, workspace, rigName,
    rigId: null, leadAddress: `control-lead@${rigName}`, seats: resolution.seats.map(s => ({ ...s, address: `${s.pod}-${s.member}@${rigName}` })),
    templatePath: resolution.templatePath, templateDigest: resolution.templateDigest, specPath: path.join(jobDir(id), 'rig.yaml'),
    profilePath: project.profilePath, profileDigest: project.profileDigest, preparedRepeatable: project.repeatable,
    setup: ['reserved'], attempt: null, lifecycle: 'preparing', outcome: options.brief ? 'working' : 'unassigned', brief: options.brief || '', briefQueueId: `job-${id}-brief`,
    evidence: [], dependencies, handoff: null, integrationBranch: project.config.integrationBranch || project.base, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: null,
  };
  if (options.plan) return { plan: true, job, environment: project.config.environment || { concurrentStacks: 'unsupported', notes: 'No project isolation contract configured' }, profileHooks: ['profile_create_worktree', 'profile_prepare_worktree', 'profile_prepare_existing_workspace', 'profile_remove_worktree'].filter(h => new RegExp(`^${h}\\s*\\(`, 'm').test(project.profile)), notice: 'Preview does not reserve this workspace or execute profile hooks. Claude choices take effect on subsequent launches.' };
  saveJob(job);
  writeAtomic(path.join(jobDir(id), 'resolution.json'), JSON.stringify(resolution));
  return continueJob(job);
}

export async function continueJob(job, plan = false) {
  guardLifecycle();
  demand(['preparing', 'failed'].includes(job.lifecycle), 'not_recoverable', 'Continue only preparing/failed jobs; use resume for stopped jobs', 3);
  if (plan) return { plan: true, job, next: job.attempt || 'next unfinished setup checkpoint' };
  try { return await completeSetup(job); }
  catch (error) {
    job.lifecycle = 'failed'; job.error = error.message; saveJob(job);
    error.jobId = job.id;
    throw error;
  }
}

export async function stopJob(job, plan = false) {
  guardLifecycle();
  demand(reserved(job), 'job_retired', 'Job is already retired', 3);
  verifyWorkspace(job);
  available(job.workspace, job.id);
  verifySeats(job);
  if (plan) return { plan: true, action: 'stop', job };
  run('rig', ['down', job.rigName, '--snapshot']);
  const nodes = nativeInventory().filter(n => n.rigName === job.rigName);
  demand(nodes.every(n => n.sessionStatus !== 'running'), 'rig_still_running', 'Rig still reports running seats after stop', 1);
  await restoreInstructions(job);
  job.lifecycle = 'stopped';
  return saveJob(job);
}

export async function resumeJob(job, plan = false) {
  guardLifecycle();
  demand(job.lifecycle === 'stopped', 'not_stopped', 'Resume requires a stopped job', 3);
  verifyWorkspace(job);
  const nodes = available(job.workspace, job.id);
  const own = verifySeats(job, nodes);
  const running = own.some(n => n.sessionStatus === 'running');
  demand(!running || job.attempt === 'resumed', 'rig_already_running', 'Recorded rig is already running without a matching resume attempt; inspect status', 3);
  if (plan) return { plan: true, action: running ? 'reconcile-resume' : 'resume', job };
  if (!running) {
    snapshotInstructions(job, true);
    checkDependencies(job);
    applyPermissions(job);
    job.attempt = 'resumed';
    saveJob(job);
    run('rig', ['up', job.rigName, '--existing']);
    verifySeats(job);
  }
  await verifyInstructions(job);
  job.attempt = null;
  job.lifecycle = 'running'; job.error = null;
  return saveJob(job);
}

export async function finishJob(job, options) {
  guardLifecycle();
  demand(!(options.worktree && options.detachWorktree), 'conflicting_cleanup', 'Choose --worktree or --detach-worktree');
  demand(job.workspace.owned || (!options.worktree && !options.detachWorktree), 'user_workspace_cleanup_forbidden', 'Existing checkout is user-owned; cleanup flags are not allowed');
  demand(reserved(job), 'job_retired', 'Job is already retired', 3);
  const inventory = available(job.workspace, job.id);
  const nodes = inventory.filter(row => row.rigName === job.rigName);
  if (nodes.length) verifySeats(job, inventory, job.lifecycle === 'failed' && job.attempt === 'launched');
  demand(nodes.length || !job.setup.includes('launched') || job.setup.includes('retired') || job.attempt === 'retired', 'rig_missing', 'Recorded launched rig is missing; inspect native state before retiring', 3);
  if (fs.existsSync(job.workspace.path)) verifyWorkspace(job);
  if (options.plan) return { plan: true, action: options.detachWorktree ? 'detach' : options.worktree ? 'remove-worktree' : 'finish', job };
  if (nodes.length) {
    job.attempt = 'retired';
    saveJob(job);
    run('rig', ['down', job.rigName, '--delete', '--force']);
    demand(!nativeInventory().some(n => n.rigName === job.rigName), 'rig_still_registered', 'Rig retirement did not remove the recorded rig; workspace remains reserved', 1);
  }
  if (job.attempt === 'retired') {
    if (!job.setup.includes('retired')) job.setup.push('retired');
    job.attempt = null;
    saveJob(job);
  }
  if (fs.existsSync(job.workspace.path)) await restoreInstructions(job);
  if (job.handoff && fs.existsSync(job.workspace.path)) demand(matchingHandoff(job, job.handoff), 'stale_handoff', 'Workspace handoff changed after verification; record a fresh handoff before retirement', 4);
  if (options.detachWorktree) {
    run('node', [path.join(root, 'lib/worktree-detach.mjs'), job.repo, job.workspace.path]);
    job.lifecycle = 'detached';
  } else if (options.worktree) {
    if (!profileHook(job, 'profile_remove_worktree')) git(job.repo, 'worktree', 'remove', job.workspace.path);
    demand(!fs.existsSync(job.workspace.path) && !git(job.repo, 'worktree', 'list', '--porcelain').split('\n').includes(`worktree ${job.workspace.path}`), 'worktree_still_present', 'Worktree removal did not remove directory and registration', 1);
    job.lifecycle = 'removed';
  } else job.lifecycle = 'finished';
  job.error = null;
  return saveJob(job);
}
