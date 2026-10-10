import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { demand, caller, nativeInventory, nativeQueue, queueFor, queueWrite, root } from './job-tools.mjs';
import { listFleets, saveJob } from './job-state.mjs';

export function managerFor(job) {
  return listFleets().find(fleet => fleet.coordinating && fleet.jobIds.includes(job.id) && fleet.manager)?.manager || null;
}

export function authorizeJob(job, { leadOnly = false } = {}) {
  const identity = caller();
  if (!identity) return 'human-directed';
  const manager = managerFor(job);
  const seat = job.seats.find(s => s.nodeId === identity.nodeId && job.rigId === identity.rigId);
  const isManager = manager?.nodeId === identity.nodeId && manager.rigId === identity.rigId;
  demand(seat || isManager, 'wrong_job_caller', 'Calling seat does not belong to this job or its designated fleet manager', 3);
  if (leadOnly) demand(seat?.address === job.leadAddress, 'lead_required', 'Only this job lead may record its outcome', 3);
  return seat?.address || manager.address;
}

export function queueCreate(job, id, destination, body, kind, summary, extra = []) {
  const existing = nativeQueue().find(item => (item.qitemId || item.qitem_id) === id);
  if (existing) {
    demand((existing.destinationSession || existing.destination_session) === destination && queueFor(job, [existing]).length === 1, 'queue_id_collision', 'Existing queue ID does not match this job/destination', 3);
    return existing;
  }
  return queueWrite('create', {qitemId:id,destinationSession:destination,tags:[`job:${job.id}`,`kind:${kind}`],body,summary}, ['queue', 'create', '--destination', destination, '--id', id, '--tags', `job:${job.id},kind:${kind}`, '--body', body, '--summary', summary, ...extra, '--json']);
}

export function briefBody(job) {
  const waiting = job.dependencies.some(dep => dep.state !== 'ready');
  return `Job ${job.id} (${job.name}) on ${job.project}. Workspace: ${job.workspace.path}. Tools: ${root}/bin/rig-job. Lead: ${job.leadAddress}. ${waiting ? 'DEPENDENCY GATE: investigation only; dependent implementation must wait for dependency-check readiness. ' : ''}${job.brief}`;
}

export function deliverBrief(job) {
  if (!job.brief) return;
  queueCreate(job, job.briefQueueId, job.leadAddress, briefBody(job), 'brief', `Job ${job.name}`);
}

export function tellJob(job, message, id = `job-${randomUUID()}`) {
  authorizeJob(job);
  demand(typeof message === 'string' && message.trim(), 'empty_message', 'Supply a nonempty --message');
  return queueCreate(job, id, job.leadAddress, briefBody({ ...job, brief: message }), 'instruction', message.slice(0, 160));
}

export function attention(job, options) {
  authorizeJob(job);
  demand(['decision', 'permission', 'failure', 'progress'].includes(options.kind), 'invalid_attention_kind', 'Choose decision, permission, failure, or progress');
  demand(options.summary?.trim() && options.detail?.trim(), 'attention_detail_required', 'Attention needs --summary and --detail');
  const destination = options.destination || managerFor(job)?.address || job.leadAddress;
  const extra = ['--tags', `job:${job.id},attention:${options.kind}`];
  demand(!options.destination || options.evidenceRef, 'evidence_required', 'An explicit human destination requires --evidence-ref PATH');
  if (options.evidenceRef) extra.push('--evidence-ref', options.evidenceRef);
  const id = options.requestId || `job-${randomUUID()}`;
  return queueWrite('create', {qitemId:id,destinationSession:destination,tags:[`job:${job.id}`,`attention:${options.kind}`],body:options.detail,summary:options.summary,evidenceRef:options.evidenceRef,...(options.kind === 'progress' && options.destination ? {humanIntent:'update'} : {})}, ['queue', 'create', '--destination', destination, '--id', id, ...extra, '--body', options.detail, '--summary', options.summary, ...(options.kind === 'progress' && options.destination ? ['--human-intent', 'update'] : []), '--json']);
}

export function answer(job, requestId, body) {
  authorizeJob(job);
  demand(body?.trim(), 'empty_response', 'Supply --body TEXT');
  const item = queueFor(job).find(row => (row.qitemId || row.qitem_id) === requestId);
  demand(item, 'request_not_found', `Queue item ${requestId} does not belong to this job`);
  queueWrite('update', {qitemId:requestId,note:body}, ['queue', 'update', requestId, '--note', body, '--json']);
  return queueCreate(job, `answer-${requestId}-${createHash('sha256').update(body).digest('hex').slice(0, 16)}`, job.leadAddress, `Response to ${requestId}: ${body}`, 'response', body.slice(0, 160));
}

export function report(job, outcome, evidenceFile) {
  const author = authorizeJob(job, { leadOnly: true });
  demand(['unassigned', 'working', 'waiting-human', 'waiting-dependency', 'verified', 'abandoned'].includes(outcome), 'invalid_outcome', 'Invalid job outcome');
  const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
  demand(Array.isArray(evidence), 'invalid_evidence', 'Evidence file must contain an array');
  const current = nativeInventory().filter(node => node.rigName === job.rigName);
  for (const entry of evidence) {
    demand(entry && ['review', 'test', 'progress', 'handoff'].includes(entry.kind) && typeof entry.summary === 'string' && entry.summary.trim() && typeof entry.author === 'string' && job.seats.some(s => s.address === entry.author), 'invalid_evidence', 'Evidence needs a recorded seat author, kind, and nonempty summary');
    if (author !== 'human-directed') demand(current.some(node => node.canonicalSessionName === entry.author && job.seats.some(s => s.address === entry.author && s.nodeId === node.nodeId)), 'unverified_evidence_author', 'Evidence author no longer matches the registered job seat', 3);
    entry.reference ??= null;
    entry.createdAt ||= new Date().toISOString();
  }
  const all = [...job.evidence, ...evidence];
  if (outcome === 'verified') {
    const reviewer = all.find(e => e.kind === 'review' && job.seats.some(s => s.member === 'reviewer' && s.address === e.author));
    const tester = all.find(e => e.kind === 'test' && job.seats.some(s => s.member === 'tester' && s.address === e.author));
    demand(reviewer && tester && reviewer.author !== tester.author, 'verification_evidence_required', 'Verified requires evidence from distinct recorded reviewer and tester seats', 4);
    demand(job.dependencies.every(dep => dep.state === 'ready'), 'dependency_blocked', 'Resolve prerequisites before marking dependent work verified', 4);
  }
  job.evidence = all;
  job.outcome = outcome;
  return saveJob(job);
}

export function observeJob(job, inventory = null, queues = null) {
  let live;
  try {
    const nodes = (inventory || nativeInventory()).filter(node => node.rigName === job.rigName);
    live = { state: nodes.length === 0 ? 'absent' : nodes.some(n => n.sessionStatus === 'running') ? 'running' : 'stopped', nodes, error: null };
  } catch (error) { live = { state: 'unknown', nodes: [], error: error.message }; }
  let queue;
  try { queue = { items: queueFor(job, queues || nativeQueue()), error: null }; }
  catch (error) { queue = { items: [], error: error.message }; }
  return { job, live, queue };
}
