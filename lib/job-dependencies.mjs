import fs from 'node:fs';
import path from 'node:path';
import { digest } from './job-project.mjs';
import { readJob, saveJob, reserved } from './job-state.mjs';
import { demand, git, prospectivePath } from './job-tools.mjs';
import { authorizeJob } from './job-coordination.mjs';

function ancestor(repo, older, newer) {
  try { git(repo, 'merge-base', '--is-ancestor', older, newer); return true; }
  catch { return false; }
}

export function dependenciesFor(ids, commonDir, workspacePath) {
  return ids.map(id => {
    const previous = readJob(id);
    demand(previous.commonDir === commonDir, 'cross_repository_dependency', 'Dependencies must belong to the same repository');
    demand(previous.outcome !== 'abandoned', 'abandoned_dependency', `Prerequisite ${id} was abandoned`, 4);
    return { jobId: id, policy: previous.workspace.path === workspacePath ? 'workspace-handoff' : 'human-merge', state: 'waiting', commit: null };
  });
}

function handoffPath(job, rel) {
  demand(typeof rel === 'string' && rel && !path.isAbsolute(rel) && !rel.split(/[\\/]/).includes('..') && rel !== '.git' && !rel.startsWith('.git/'), 'unsafe_handoff_path', `Invalid handoff path ${rel}`);
  const target = path.join(job.workspace.path, rel);
  const parent = prospectivePath(path.dirname(target));
  demand(parent === job.workspace.path || parent.startsWith(`${job.workspace.path}${path.sep}`), 'unsafe_handoff_path', 'Handoff path escapes workspace through a symlink');
  return target;
}

function currentEntry(job, entry) {
  const target = handoffPath(job, entry.path);
  if (!fs.existsSync(target) && !fs.lstatSync(target, { throwIfNoEntry: false })) return { kind: 'absent', digest: null };
  const stat = fs.lstatSync(target);
  demand(stat.isFile() || stat.isSymbolicLink(), 'invalid_handoff_type', 'Handoff entries must be files, symlinks or absent paths');
  return { kind: stat.isSymbolicLink() ? 'symlink' : 'file', digest: digest(stat.isSymbolicLink() ? fs.readlinkSync(target) : fs.readFileSync(target)) };
}

export function matchingHandoff(job, snapshot) {
  if (!snapshot || git(job.workspace.path, 'rev-parse', 'HEAD') !== snapshot.head) return false;
  return snapshot.files.every(entry => {
    const now = currentEntry(job, entry);
    return now.kind === entry.kind && now.digest === entry.digest;
  });
}

export function recordHandoff(job, file) {
  authorizeJob(job, { leadOnly: true });
  demand(job.outcome === 'verified', 'verification_required', 'Verify the candidate before recording its handoff', 4);
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  demand(snapshot && typeof snapshot.head === 'string' && Array.isArray(snapshot.files) && snapshot.files.length > 0, 'invalid_handoff', 'Handoff needs head and nonempty files array');
  demand(snapshot.files.every(entry => entry && typeof entry.path === 'string' && ['file', 'symlink', 'absent'].includes(entry.kind) && (entry.kind === 'absent' ? entry.digest === null : /^[a-f0-9]{64}$/.test(entry.digest))), 'invalid_handoff', 'Invalid handoff entry');
  demand(matchingHandoff(job, snapshot), 'stale_handoff', 'Handoff does not match workspace HEAD/content', 4);
  job.handoff = snapshot;
  return saveJob(job);
}

export function markMerged(job, revision, attest = false) {
  demand(revision, 'commit_required', 'Supply --commit REV');
  const commit = git(job.repo, 'rev-parse', '--verify', `${revision}^{commit}`);
  const target = git(job.repo, 'rev-parse', '--verify', `${job.integrationBranch}^{commit}`);
  demand(ancestor(job.repo, commit, target), 'not_integrated', `${commit} is not on ${job.integrationBranch}`, 4);
  const source = job.branch || job.handoff?.head || job.baseCommit;
  demand(attest || ancestor(job.repo, source, commit), 'merge_mapping_required', 'Ancestry does not prove source integration; use --attest only for a human-confirmed squash/rebase mapping', 4);
  authorizeJob(job);
  demand(!process.env.OPENRIG_SESSION_NAME && !process.env.OPENRIG_NODE_ID, 'human_merge_required', 'Merge declarations and attestations are human-directed operations', 3);
  job.mergedCommit = commit;
  job.mergeAttested = attest;
  return saveJob(job);
}

export function checkDependencies(job, persist = true) {
  for (const dep of job.dependencies) {
    const previous = readJob(dep.jobId);
    dep.commit = null;
    if (previous.outcome === 'abandoned') { dep.state = 'blocked'; continue; }
    if (dep.policy === 'workspace-handoff') {
      const accepted = dep.handoffAcceptedAt || (matchingHandoff(job, previous.handoff) ? new Date().toISOString() : null);
      dep.state = !reserved(previous) && previous.outcome === 'verified' && previous.workspace.path === job.workspace.path && accepted ? 'ready' : 'waiting';
      if (dep.state === 'ready') dep.handoffAcceptedAt = accepted;
    } else {
      const commit = previous.mergedCommit;
      dep.state = commit && ancestor(job.repo, commit, job.integrationBranch) && fs.existsSync(job.workspace.path) && ancestor(job.workspace.path, commit, 'HEAD') ? 'ready' : 'waiting';
      dep.commit = dep.state === 'ready' ? commit : null;
    }
  }
  if (job.dependencies.length) {
    if (job.dependencies.some(dep => dep.state !== 'ready')) job.outcome = 'waiting-dependency';
    else if (job.outcome === 'waiting-dependency') job.outcome = job.brief ? 'working' : 'unassigned';
  }
  return persist ? saveJob(job) : job;
}
