import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, demand } from './job-tools.mjs';
import { readJob, listJobs, withStateLock } from './job-state.mjs';
import { startJob, continueJob, stopJob, resumeJob, finishJob } from './job-lifecycle.mjs';
import { tellJob, attention, answer, report, observeJob, authorizeJob } from './job-coordination.mjs';
import { checkDependencies, markMerged, recordHandoff } from './job-dependencies.mjs';

export const jobUsage = `rig-job start PROJECT NAME (--workspace PATH|--worktree) [--repo PATH] [--template PATH] [--branch REF] [--base REF] [--brief TEXT] [--depends-on ID] [--plan] [--json]
rig-job list [--project PROJECT] [--json]
rig-job status ID [--json]
rig-job continue|stop|resume ID [--plan] [--json]
rig-job finish ID [--worktree|--detach-worktree] [--plan] [--json]
rig-job tell ID --message TEXT [--json]
rig-job attention ID --kind decision|permission|failure|progress --summary TEXT --detail TEXT [--destination ADDRESS --evidence-ref PATH] [--request-id ID] [--json]
rig-job answer ID QITEM --body TEXT [--json]
rig-job report ID --outcome VALUE --evidence-file PATH [--json]
rig-job merged ID --commit REV [--attest] [--json]
rig-job handoff ID --file PATH [--json]
rig-job dependency-check ID [--json]
Legacy: rig-job start/finish PROJECT NAME --teams fe,be; profile-init|doctor|can-spawn retain legacy behavior.`;

const flags = {
  start: ['repo', 'workspace', 'worktree', 'template', 'branch', 'base', 'brief', 'depends-on', 'plan', 'json'],
  list: ['project', 'json'], status: ['json'], continue: ['plan', 'json'], stop: ['plan', 'json'], resume: ['plan', 'json'],
  finish: ['worktree', 'detach-worktree', 'plan', 'json'], tell: ['message', 'json'],
  attention: ['kind', 'summary', 'detail', 'destination', 'evidence-ref', 'request-id', 'json'],
  answer: ['body', 'json'], report: ['outcome', 'evidence-file', 'json'], merged: ['commit', 'attest', 'json'], handoff: ['file', 'json'], 'dependency-check': ['json'],
};

export function parseOptions(command, args, surface = flags) {
  demand(surface[command], 'unknown_command', `Unknown command ${command}`);
  const options = { dependsOn: [] };
  const positional = [];
  const booleans = ['worktree', 'detach-worktree', 'plan', 'json', 'attest'];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { positional.push(args[i]); continue; }
    const flag = args[i].slice(2);
    demand(surface[command].includes(flag), 'unknown_option', `Unknown ${command} option --${flag}`);
    const key = flag.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = booleans.includes(flag) ? true : args[++i];
    demand(value !== undefined && (value === true || !value.startsWith('--')), 'missing_option_value', `Missing value for --${flag}`);
    if (flag === 'depends-on') options.dependsOn.push(value);
    else {
      demand(options[key] === undefined, 'duplicate_option', `Duplicate --${flag}`);
      options[key] = value;
    }
  }
  return { options, positional };
}

export function printResult(value, json) {
  if (json) { console.log(JSON.stringify({ ok: true, data: value })); return; }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const job = entry.job || entry;
      console.log(`${job.id}  ${job.name}  ${job.lifecycle}  ${job.outcome}  ${job.workspace.path}`);
    }
    if (!value.length) console.log('No recorded jobs.');
    return;
  }
  if (value.job && !value.plan) {
    console.log(`${value.job.name} (${value.job.id})\nRig: ${value.job.rigName}\nWorkspace: ${value.job.workspace.path}\nLifecycle: ${value.job.lifecycle}; live: ${value.live.state}; outcome: ${value.job.outcome}`);
    if (value.live.error) console.log(`Live state unknown: ${value.live.error}`);
    if (value.queue.error) console.log(`Queue state unknown: ${value.queue.error}`);
    for (const node of value.live.nodes) console.log(`  ${node.canonicalSessionName}: ${node.sessionStatus}; activity ${JSON.stringify(node.agentActivity || null)}`);
    for (const item of value.queue.items) console.log(`  Queue ${item.qitemId || item.qitem_id}: ${item.state} ${item.summary || item.body || ''}`);
    return;
  }
  const job = value.plan ? value.job : value;
  if (job?.rigName && job?.workspace) {
    console.log(`${value.plan ? 'PLAN: ' : ''}job ${job.name} (${job.id})\nRig: ${job.rigName}\nLead: ${job.leadAddress}\nWorkspace: ${job.workspace.path} (${job.workspace.mode})\nBranch: ${job.branch || '(detached HEAD)'}\nState: ${job.lifecycle}; outcome: ${job.outcome}`);
    if (value.notice) console.log(value.notice);
    if (job.seats.some(s => s.runtime === 'claude-code')) console.log('Claude approval selections take effect on the next launch; no automatic restart.');
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

export function printError(error, json) {
  const detail = { code: error.code || 'execution_failed', message: error.message, jobId: error.jobId || null };
  if (error.conflict) detail.conflict = error.conflict;
  if (json) console.log(JSON.stringify({ ok: false, error: detail }));
  else console.error(`rig-job: ${detail.message}`);
  process.exitCode = error.exitCode || 1;
}

export async function jobCommand(args) {
  const [command, ...rest] = args;
  if (!command || ['help', '--help', '-h'].includes(command)) { console.log(jobUsage); return; }
  const { options, positional } = parseOptions(command, rest);
  const expected = command === 'start' || command === 'answer' ? 2 : command === 'list' ? 0 : 1;
  demand(positional.length === expected, 'invalid_arguments', `Expected ${expected} positional arguments for ${command}\n${jobUsage}`);
  const operation = async () => {
    if (command === 'start') return startJob(positional[0], positional[1], options);
    if (command === 'list') return listJobs().filter(j => !options.project || j.project === options.project).map(j => observeJob(j));
    const job = readJob(positional[0]);
    if (command === 'status') return observeJob(job);
    if (command === 'continue') return continueJob(job, options.plan);
    if (command === 'stop') return stopJob(job, options.plan);
    if (command === 'resume') return resumeJob(job, options.plan);
    if (command === 'finish') return finishJob(job, options);
    if (command === 'tell') return tellJob(job, options.message);
    if (command === 'attention') return attention(job, options);
    if (command === 'answer') return answer(job, positional[1], options.body);
    if (command === 'report') { demand(options.evidenceFile, 'evidence_required', 'Supply --evidence-file PATH'); return report(job, options.outcome, options.evidenceFile); }
    if (command === 'merged') return markMerged(job, options.commit, options.attest);
    if (command === 'handoff') { demand(options.file, 'handoff_required', 'Supply --file PATH'); return recordHandoff(job, options.file); }
    authorizeJob(job);
    return checkDependencies(job);
  };
  const result = options.plan || ['list', 'status'].includes(command) ? await operation() : await withStateLock(operation);
  printResult(result, options.json);
}

export function legacyCommand(args) {
  const result = spawnSync('bash', [path.join(root, 'bin/rig-job-legacy'), ...args], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status || 0;
}
