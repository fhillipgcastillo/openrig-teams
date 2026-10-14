import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fixture, installedPackage } from './fixture.mjs';

const yaml = createRequire(path.join(installedPackage, 'package.json'))('yaml');
const { RigSpecSchema } = await import(pathToFileURL(path.join(installedPackage, 'daemon/dist/domain/rigspec-schema.js')));

function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function lab(t) {
  const f = fixture(t);
  f.env.OPENRIG_TEAMS_STATE = path.join(f.temporary, 'state');
  f.env.TEST_NATIVE = path.join(f.temporary, 'native.json');
  f.env.OPENRIG_NODE_ID = '';
  f.env.RIGGED_SESSION_NAME = '';
  fs.writeFileSync(f.env.TEST_NATIVE, JSON.stringify({ rows: [], queue: [] }));
  const packagePath = JSON.stringify(installedPackage);
  fs.writeFileSync(path.join(f.packageRoot, 'bin/rig'), `#!${process.execPath}
const fs=require('node:fs'), path=require('node:path');
const yaml=require('yaml');
const {mergeManagedBlock,stripManagedBlocks}=require(${packagePath}+'/daemon/dist/domain/managed-blocks.js');
const args=process.argv.slice(2);
const file=process.env.TEST_NATIVE;
let state=JSON.parse(fs.readFileSync(file,'utf8'));
const save=()=>fs.writeFileSync(file,JSON.stringify(state));
const result=value=>process.stdout.write(JSON.stringify(value));
fs.appendFileSync(process.env.TEST_LOG,JSON.stringify(['rig',...args])+'\\n');
const option=key=>args[args.indexOf(key)+1];
if(args[0]===process.env.TEST_FAIL_COMMAND){console.error('injected failure');process.exit(1);}
if(args[0]==='ps') {result(state.rows);process.exit(0);}
if(args[0]==='whoami') {const row=state.rows.find(r=>r.nodeId===process.env.OPENRIG_NODE_ID || r.canonicalSessionName===process.env.OPENRIG_SESSION_NAME);result({identity:row});process.exit(0);}
if(args[0]==='up') {
  if(args.includes('--existing')) {for(const row of state.rows.filter(r=>r.rigName===args[1]))row.sessionStatus='running';}
  else {
    const spec=yaml.parse(fs.readFileSync(args[1],'utf8'));
    const cwd=option('--cwd');
    for(const pod of spec.pods)for(const member of pod.members)state.rows.push({nodeId:spec.name+'-'+pod.id+'-'+member.id,rigId:spec.name+'-id',rigName:spec.name,logicalId:pod.id+'.'+member.id,canonicalSessionName:pod.id+'-'+member.id+'@'+spec.name,runtime:member.runtime,cwd,sessionStatus:'running',attachmentType:'tmux',agentActivity:{state:'idle'}});
    for(const runtime of new Set(state.rows.filter(r=>r.rigName===spec.name).map(r=>r.runtime))){
      const target=path.join(cwd,runtime==='codex'?'AGENTS.md':'CLAUDE.local.md');
      const ops={exists:p=>fs.existsSync(p),readFile:p=>fs.readFileSync(p,'utf8'),writeFile:(p,s)=>fs.writeFileSync(p,s)};
      mergeManagedBlock(ops,target,'openrig-start.md','Native runtime guidance');
    }
  }
  save();
  if(process.env.TEST_FAIL_AFTER_UP){console.error('response lost after native launch');process.exit(1);}
  process.exit(0);
}
if(args[0]==='down'){
  const rows=state.rows.filter(r=>r.rigName===args[1]);
  for(const row of rows){const target=path.join(row.cwd,row.runtime==='codex'?'AGENTS.md':'CLAUDE.local.md');if(fs.existsSync(target))fs.writeFileSync(target,stripManagedBlocks(fs.readFileSync(target,'utf8'))+'\\n');}
  if(args.includes('--delete'))state.rows=state.rows.filter(r=>r.rigName!==args[1]);
  else for(const row of rows)row.sessionStatus='stopped';
  save();if(process.env.TEST_FAIL_AFTER_DOWN){console.error('response lost after native retirement');process.exit(1);}process.exit(0);
}
if(args[0]==='queue' && args[1]==='list'){result(state.queue);process.exit(0);}
if(args[0]==='queue' && ['create','update'].includes(args[1]) && !process.env.OPENRIG_SESSION_NAME && !process.env.RIGGED_SESSION_NAME){console.error('native queue identity required');process.exit(1);}
if(args[0]==='queue' && args[1]==='create'){
  const id=option('--id');
  if(!state.queue.some(q=>q.qitemId===id))state.queue.push({qitemId:id,destinationSession:option('--destination'),tags:option('--tags').split(','),body:option('--body'),summary:option('--summary'),state:'pending'});
  save();result({qitemId:id});process.exit(0);
}
if(args[0]==='queue' && args[1]==='update'){const item=state.queue.find(q=>q.qitemId===args[2]);if(!item){process.exit(1);}item.note=option('--note');save();result(item);process.exit(0);}
if(args[0]==='seat' && args[1]==='handover'){result({seatBindingOutcome:'handed_over',source:option('--source')});process.exit(0);}
if(args[0]==='seat' && args[1]==='set-permissions'){result({ok:true});process.exit(0);}
console.error('Unexpected mock call '+args.join(' '));process.exit(1);
`);
  fs.mkdirSync(path.join(f.packageRoot,'dist'));
  fs.writeFileSync(path.join(f.packageRoot,'dist/client.js'), `
const fs=require('node:fs');
const {requireSenderIdentity}=require(${packagePath}+'/daemon/dist/routes/require-sender-identity.js');
exports.DaemonClient=class {
 async post(route,body) {
  fs.appendFileSync(process.env.TEST_LOG,JSON.stringify(['native-api',route,body])+'\\n');
  if(process.env.TEST_FAIL_COMMAND==='queue')throw new Error('injected queue failure');
  const identity=requireSenderIdentity({req:{header:()=>undefined},json:(data,status)=>({data,status})},{bodyClaim:body.sourceSession||body.actorSession});
  if(!identity.ok)return identity.response;
  const state=JSON.parse(fs.readFileSync(process.env.TEST_NATIVE,'utf8'));
  let result;
  if(route==='/api/queue/create'){
   result=state.queue.find(q=>q.qitemId===body.qitemId);
   if(!result){result={...body,state:'pending',identityProvenance:identity.provenance};state.queue.push(result);}
  }else{result=state.queue.find(q=>route==='/api/queue/'+encodeURIComponent(q.qitemId)+'/update');if(!result)return {status:404,data:{error:'missing'}};result.note=body.transitionNote;}
  fs.writeFileSync(process.env.TEST_NATIVE,JSON.stringify(state));
  return {status:200,data:result};
 }
};`);
  f.settings();
  const repo = path.join(f.temporary, 'project');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'file.txt'), 'original\n');
  git(repo, 'add', 'file.txt');
  git(repo, '-c', 'user.name=Test', '-c', 'user.email=test@invalid', 'commit', '-qm', 'initial');
  const command = (args, env = {}, expected = 0) => {
    const result = f.run('bin/rig-job', [...args, '--json'], env);
    assert.equal(result.status, expected, result.stderr + result.stdout);
    return JSON.parse(result.stdout);
  };
  const start = (name, opts = [], env = {}, expected = 0) => command(['start', 'project', name, '--repo', repo, ...opts], env, expected);
  const native = () => JSON.parse(fs.readFileSync(f.env.TEST_NATIVE, 'utf8'));
  const fleet = (args, env = {}, expected = 0) => {
    const result = f.run('bin/rig-fleet', [...args, '--json'], env);
    assert.equal(result.status, expected, result.stderr + result.stdout);
    return JSON.parse(result.stdout);
  };
  return { ...f, repo, command, start, native, fleet };
}

test('complete job runs in existing dirty checkout without a new branch or worktree', t => {
  const f = lab(t);
  fs.writeFileSync(path.join(f.repo, 'file.txt'), 'user work\n');
  const before = git(f.repo, 'worktree', 'list', '--porcelain');
  const { data: job } = f.start('existing', ['--workspace', f.repo, '--brief', 'Build feature']);
  assert.equal(job.workspace.mode, 'existing');
  assert.equal(job.lifecycle, 'running');
  assert.equal(job.seats.length, 4);
  assert.equal(fs.statSync(path.join(f.env.OPENRIG_TEAMS_STATE,'jobs',job.id,'manifest.json')).mode & 0o777,0o600);
  assert.equal(job.leadAddress, `control-lead@${job.rigName}`);
  assert.equal(fs.readFileSync(path.join(f.repo, 'file.txt'), 'utf8'), 'user work\n');
  assert.equal(git(f.repo, 'worktree', 'list', '--porcelain'), before);
  assert.equal(git(f.repo, 'branch', '--show-current'), 'main');
  assert.equal(f.native().queue[0].sourceSession, 'openrig-teams-shell');
  assert.equal(f.native().queue[0].identityProvenance, 'claimed:v1');
  assert.equal(f.native().queue[0].destinationSession, job.leadAddress);
  assert.match(f.native().queue[0].body, /Build feature/);
  const { data: status } = f.command(['status', job.id]);
  assert.equal(status.live.nodes.length, 4);
  assert.equal(status.queue.items.length, 1);
  assert.equal(status.live.state, 'running');
  assert.equal(RigSpecSchema.validate(yaml.parse(fs.readFileSync(job.specPath, 'utf8'))).valid, true);
});

test('managed jobs create nested Git worktrees and independent complete rigs', t => {
  const f = lab(t);
  const a = f.start('a', ['--worktree']).data;
  const b = f.start('b', ['--worktree']).data;
  assert.equal(a.workspace.path, path.join(f.repo, '.worktrees/a'));
  assert.equal(git(a.workspace.path, 'branch', '--show-current'), 'feature/a');
  assert.notEqual(a.rigName, b.rigName);
  assert.equal(f.native().rows.length, 8);
  assert.match(fs.readFileSync(path.join(f.repo, '.git/info/exclude'), 'utf8'), /\/\.worktrees\//);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('preview writes no state, checkout, exclusion or instructions and executes no shell profile', t => {
  const f = lab(t);
  const marker = path.join(f.temporary, 'hook-marker');
  const profiles = path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects');
  fs.mkdirSync(profiles);
  fs.writeFileSync(path.join(profiles, 'project.sh'), `PROJECT_PATH='${f.repo}'\ntouch '${marker}'\nprofile_prepare_worktree() { run touch '${marker}'; }\n`);
  const exclude = fs.readFileSync(path.join(f.repo, '.git/info/exclude'), 'utf8');
  const result = f.start('preview', ['--worktree', '--plan']).data;
  assert.equal(result.plan, true);
  assert.equal(fs.existsSync(f.env.OPENRIG_TEAMS_STATE), false);
  assert.equal(fs.existsSync(path.join(f.repo, '.worktrees')), false);
  assert.equal(fs.existsSync(path.join(f.repo, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.readFileSync(path.join(f.repo, '.git/info/exclude'), 'utf8'), exclude);
});

test('occupied aliases are refused with occupant and user options without starting another rig', t => {
  const f = lab(t);
  const first = f.start('first', ['--workspace', f.repo]).data;
  const alias = path.join(f.temporary, 'alias');
  fs.symlinkSync(f.repo, alias);
  const result = f.start('second', ['--workspace', alias], {}, 3);
  assert.equal(result.error.code, 'workspace_occupied');
  assert.equal(result.error.conflict.jobId, first.id);
  assert.deepEqual(result.error.conflict.options, ['use-existing-rig', 'request-worktree-job']);
  assert.equal(f.native().rows.length, 4);
  assert.equal(fs.existsSync(path.join(f.repo, '.worktrees')), false);
});

test('live legacy occupancy and inaccessible native inventory block startup', t => {
  const f = lab(t);
  fs.writeFileSync(f.env.TEST_NATIVE, JSON.stringify({ rows: [{ nodeId: 'legacy-node', rigId: 'legacy-id', rigName: 'legacy', cwd: f.repo, sessionStatus: 'running' }], queue: [] }));
  assert.equal(f.start('blocked', ['--workspace', f.repo], {}, 3).error.conflict.rigName, 'legacy');
  const denied = f.start('offline', ['--worktree'], { TEST_FAIL_COMMAND: 'ps' }, 1);
  assert.equal(denied.error.code, 'command_failed');
  assert.equal(fs.existsSync(path.join(f.repo, '.worktrees')), false);
});

test('project runtime/model overrides resolve per instance and resume stays frozen', t => {
  const f = lab(t);
  fs.mkdirSync(path.join(f.repo, '.openrig-teams'));
  fs.writeFileSync(path.join(f.repo, '.openrig-teams/project.json'), JSON.stringify({ version: 1, seats: { 'verify.reviewer': { runtime: 'claude-code', model: 'claude-sonnet-4-6' } } }));
  const job = f.start('mixed', ['--workspace', f.repo]).data;
  const spec = yaml.parse(fs.readFileSync(job.specPath, 'utf8'));
  assert.equal(spec.pods[2].members[0].model, 'claude-sonnet-4-6');
  assert.equal(job.seats[2].runtime, 'claude-code');
  f.command(['stop', job.id]);
  f.settings({ runtime: 'claude-code' });
  const resumed = f.command(['resume', job.id]).data;
  assert.equal(resumed.seats[0].runtime, 'codex');
  assert.equal(resumed.seats[2].runtime, 'claude-code');
  assert.equal(f.native().rows.length, 4);
});

test('tracked instructions survive native managed blocks and cleanup preserves user edits', t => {
  const f = lab(t);
  const original = '# Rules\n\nKeep spacing.\n\n';
  fs.writeFileSync(path.join(f.repo, 'AGENTS.md'), original);
  git(f.repo, 'add', 'AGENTS.md');
  const job = f.start('instructions', ['--workspace', f.repo]).data;
  assert.ok(fs.readFileSync(path.join(f.repo, 'AGENTS.md'), 'utf8').startsWith(original));
  f.command(['finish', job.id]);
  assert.equal(fs.readFileSync(path.join(f.repo, 'AGENTS.md'), 'utf8'), original);
  assert.equal(fs.existsSync(f.repo), true);
  const next = f.start('edited', ['--workspace', f.repo]).data;
  fs.appendFileSync(path.join(f.repo, 'AGENTS.md'), '\nNew user rule.\n');
  f.command(['finish', next.id]);
  assert.match(fs.readFileSync(path.join(f.repo, 'AGENTS.md'), 'utf8'), /New user rule/);
  assert.equal(fs.readFileSync(path.join(f.repo, 'AGENTS.md'), 'utf8').includes('OpenRig MANAGED'), false);
});

test('unsafe tracked runtime target refuses before creating a branch', t => {
  const f = lab(t);
  f.settings({ runtime: 'claude-code' });
  fs.writeFileSync(path.join(f.repo, '.mcp.json'), '{}');
  git(f.repo, 'add', '.mcp.json');
  const result = f.start('collision', ['--worktree'], {}, 2);
  assert.equal(result.error.code, 'tracked_projection_collision');
  assert.equal(git(f.repo, 'branch', '--list', 'feature/collision'), '');
});

test('existing checkout cleanup flags fail before native down', t => {
  const f = lab(t);
  const job = f.start('existing', ['--workspace', f.repo]).data;
  const before = f.calls().length;
  assert.equal(f.command(['finish', job.id, '--worktree'], {}, 2).error.code, 'user_workspace_cleanup_forbidden');
  assert.equal(f.calls().slice(before).some(c => c[1] === 'down'), false);
  assert.equal(fs.existsSync(f.repo), true);
});

test('stopped reservations block new jobs; explicit finish releases them', t => {
  const f = lab(t);
  const job = f.start('first', ['--workspace', f.repo]).data;
  f.command(['stop', job.id]);
  assert.equal(f.start('second', ['--workspace', f.repo], {}, 3).error.code, 'workspace_occupied');
  f.command(['finish', job.id]);
  assert.equal(f.start('second', ['--workspace', f.repo]).data.lifecycle, 'running');
});

test('lost launch response reconciles existing seats without duplicate launch or brief', t => {
  const f = lab(t);
  const result = f.start('interrupted', ['--workspace', f.repo, '--brief', 'Keep going'], { TEST_FAIL_AFTER_UP: '1' }, 1);
  const id = result.error.jobId;
  assert.ok(id);
  assert.equal(f.native().rows.length, 4);
  f.command(['continue', id]);
  assert.equal(f.native().rows.length, 4);
  assert.equal(f.calls().filter(c => c[1] === 'up').length, 1);
  assert.equal(f.native().queue.length, 1);
});

test('native brief failure is recoverable using its stable queue id', t => {
  const f = lab(t);
  const result = f.start('brief-fail', ['--workspace', f.repo, '--brief', 'Assignment'], { TEST_FAIL_COMMAND: 'queue' }, 1);
  const job = f.command(['continue', result.error.jobId]).data;
  assert.equal(job.lifecycle, 'running');
  assert.equal(f.native().queue[0].qitemId, job.briefQueueId);
  assert.equal(f.calls().filter(c => c[1] === 'up').length, 1);
});

test('existing mode never executes worktree preparation hooks', t => {
  const f = lab(t);
  const marker = path.join(f.temporary, 'wrong-hook');
  fs.mkdirSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects'));
  fs.writeFileSync(path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects/project.sh'), `PROJECT_PATH='${f.repo}'\nprofile_prepare_worktree() { run touch '${marker}'; }\n`);
  f.start('existing', ['--workspace', f.repo]);
  assert.equal(fs.existsSync(marker), false);
});

test('managed preparation hooks execute in worktree context and changed profiles block recovery', t => {
  const f = lab(t);
  const profiles = path.join(f.env.OPENRIG_TEAMS_CONFIG, 'projects');
  fs.mkdirSync(profiles);
  const profile = path.join(profiles, 'project.sh');
  fs.writeFileSync(profile, `PROJECT_PATH='${f.repo}'\nPREPARE_REPEATABLE=1\nprofile_prepare_worktree() { run touch "$WORKTREE/prepared.txt"; }\n`);
  const result = f.start('managed', ['--worktree'], { TEST_FAIL_COMMAND: 'up' }, 1);
  const job = f.command(['status', result.error.jobId]).data.job;
  assert.equal(fs.existsSync(path.join(job.workspace.path, 'prepared.txt')), true);
  fs.appendFileSync(profile, '\nCHANGED=1\n');
  assert.equal(f.command(['continue', job.id], {}, 3).error.code, 'profile_changed');
});

test('failed stop prevents worktree cleanup; dirty deletion can be retried as detach', t => {
  const f = lab(t);
  const job = f.start('cleanup', ['--worktree']).data;
  fs.writeFileSync(path.join(job.workspace.path, 'user.txt'), 'keep');
  f.command(['finish', job.id, '--worktree'], { TEST_FAIL_COMMAND: 'down' }, 1);
  assert.equal(fs.existsSync(path.join(job.workspace.path, '.git')), true);
  f.command(['finish', job.id, '--worktree'], {}, 1);
  assert.equal(fs.existsSync(path.join(job.workspace.path, 'user.txt')), true);
  f.command(['finish', job.id, '--detach-worktree']);
  assert.equal(fs.existsSync(path.join(job.workspace.path, '.git')), false);
  assert.equal(fs.readFileSync(path.join(job.workspace.path, 'user.txt'), 'utf8'), 'keep');
  assert.ok(git(f.repo, 'branch', '--list', job.branch));
});

test('native attention and replies remain discoverable without a fleet manager', t => {
  const f = lab(t);
  const job = f.start('attention', ['--workspace', f.repo]).data;
  const request = f.command(['attention', job.id, '--kind', 'decision', '--summary', 'API choice', '--detail', 'Which contract?', '--request-id', 'decision-one']).data;
  assert.equal(request.qitemId, 'decision-one');
  f.command(['answer', job.id, 'decision-one', '--body', 'Keep current contract']);
  const status = f.command(['status', job.id]).data;
  assert.equal(status.queue.items.length, 2);
  assert.equal(status.queue.items[0].note, 'Keep current contract');
  assert.equal(fs.existsSync(path.join(f.env.OPENRIG_TEAMS_STATE, 'jobs', job.id, 'attention')), false);
});

test('verification requires independent evidence and reports native permission waiting activity', t => {
  const f = lab(t);
  const job = f.start('verify', ['--workspace', f.repo]).data;
  const file = path.join(f.temporary, 'evidence.json');
  fs.writeFileSync(file, '[]');
  assert.equal(f.command(['report', job.id, '--outcome', 'verified', '--evidence-file', file], {}, 4).error.code, 'verification_evidence_required');
  fs.writeFileSync(file, JSON.stringify([{ author: job.seats[2].address, kind: 'review', summary: 'Reviewed candidate' }, { author: job.seats[3].address, kind: 'test', summary: 'Tests passed' }]));
  assert.equal(f.command(['report', job.id, '--outcome', 'verified', '--evidence-file', file]).data.outcome, 'verified');
  const state = f.native(); state.rows[0].agentActivity = { state: 'needs-input' }; fs.writeFileSync(f.env.TEST_NATIVE, JSON.stringify(state));
  assert.equal(f.command(['status', job.id]).data.live.nodes[0].agentActivity.state, 'needs-input');
});

test('fleet assignment uses native seats; release has no stop or handover side effects', t => {
  const f = lab(t);
  const job = f.start('job', ['--workspace', f.repo]).data;
  f.fleet(['create', 'main']);
  f.fleet(['add', 'main', job.id]);
  f.fleet(['take', 'main', '--seat', job.leadAddress]);
  const request = f.command(['attention', job.id, '--kind', 'failure', '--summary', 'Blocked', '--detail', 'Need help']).data;
  assert.ok(request.qitemId);
  const before = f.calls().length;
  f.fleet(['release', 'main']);
  assert.equal(f.calls().slice(before).some(c => ['down', 'up', 'seat'].includes(c[1])), false);
  const status = f.fleet(['status', 'main']).data;
  assert.equal(status.fleet.coordinating, false);
  assert.equal(status.fleet.manager.address, job.leadAddress);
  assert.equal(status.jobs[0].live.state, 'running');
});

test('optional fleet up creates its own native manager and handover delegates upstream', t => {
  const f = lab(t);
  f.fleet(['create', 'main']);
  const preview = f.fleet(['up', 'main', '--plan']).data;
  assert.equal(preview.plan, true);
  assert.equal(f.native().rows.length, 0);
  const fleet = f.fleet(['up', 'main']).data;
  assert.equal(f.native().rows.length, 1);
  assert.match(fleet.manager.address, /^control-manager@fleet-main-/);
  assert.equal(f.fleet(['up','main']).data.manager.nodeId,fleet.manager.nodeId);
  assert.equal(f.native().rows.length,1);
  f.fleet(['handover', 'main', '--source', 'fresh']);
  assert.ok(f.calls().some(c => c[1] === 'seat' && c[2] === 'handover'));
  f.fleet(['handover','main','--source','fresh'],{TEST_FAIL_COMMAND:'seat'},1);
  assert.equal(f.fleet(['status','main']).data.fleet.manager.nodeId,fleet.manager.nodeId);
});

test('offline status preserves recorded jobs and reports unknown rather than missing', t => {
  const f = lab(t);
  const job = f.start('offline-status', ['--workspace', f.repo]).data;
  const status = f.command(['status', job.id], { TEST_FAIL_COMMAND: 'ps' }).data;
  assert.equal(status.live.state, 'unknown');
  assert.equal(status.job.lifecycle, 'running');
});

test('state lock refuses concurrent mutation without automatic lock deletion', t => {
  const f = lab(t);
  const lock = path.join(f.env.OPENRIG_TEAMS_STATE, '.mutation-lock');
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'owner.json'), '{"pid":1}');
  assert.equal(f.start('locked', ['--workspace', f.repo], {}, 3).error.code, 'state_locked');
  assert.equal(fs.existsSync(lock), true);
  assert.equal(f.native().rows.length, 0);
});

export { lab, git };

function verifyCandidate(f, job) {
  const evidence = path.join(f.temporary, `evidence-${job.id}.json`);
  fs.writeFileSync(evidence, JSON.stringify([{author:job.seats[2].address,kind:'review',summary:'Candidate reviewed'}, {author:job.seats[3].address,kind:'test',summary:'Candidate tested'}]));
  return f.command(['report',job.id,'--outcome','verified','--evidence-file',evidence]);
}

test('resume accepts project instruction edits made while stopped', t => {
  const f = lab(t);
  fs.writeFileSync(path.join(f.repo,'AGENTS.md'),'Original rules\n');
  const job = f.start('resume-edits',['--workspace',f.repo]).data;
  f.command(['stop',job.id]);
  fs.writeFileSync(path.join(f.repo,'AGENTS.md'),'Updated project rules\n');
  f.command(['resume',job.id]);
  f.command(['finish',job.id]);
  assert.equal(fs.readFileSync(path.join(f.repo,'AGENTS.md'),'utf8'),'Updated project rules\n');
});

test('lost retirement response can be reconciled without abandoning reservation', t => {
  const f = lab(t);
  const job = f.start('retirement',['--workspace',f.repo]).data;
  f.command(['finish',job.id],{TEST_FAIL_AFTER_DOWN:'1'},1);
  assert.equal(f.native().rows.length,0);
  assert.equal(f.start('blocked',['--workspace',f.repo],{},3).error.code,'workspace_occupied');
  assert.equal(f.command(['finish',job.id]).data.lifecycle,'finished');
});

test('cross-workspace dependency waits for human merge and dependent HEAD availability', t => {
  const f = lab(t);
  const a = f.start('prerequisite',['--worktree']).data;
  fs.writeFileSync(path.join(a.workspace.path,'feature.txt'),'feature');
  git(a.workspace.path,'add','feature.txt');
  git(a.workspace.path,'-c','user.name=Test','-c','user.email=test@invalid','commit','-qm','feature');
  verifyCandidate(f,a);
  const b = f.start('dependent',['--worktree','--depends-on',a.id,'--brief','Use feature']).data;
  assert.equal(b.outcome,'waiting-dependency');
  assert.match(f.native().queue.find(q=>q.qitemId===b.briefQueueId).body,/DEPENDENCY GATE/);
  const commit = git(a.workspace.path,'rev-parse','HEAD');
  assert.equal(f.command(['merged',a.id,'--commit',commit],{},4).error.code,'not_integrated');
  git(f.repo,'merge','--ff-only',a.branch);
  f.command(['merged',a.id,'--commit',commit]);
  assert.equal(f.command(['dependency-check',b.id]).data.dependencies[0].state,'waiting');
  git(b.workspace.path,'merge','--ff-only','main');
  assert.equal(f.command(['dependency-check',b.id]).data.dependencies[0].state,'ready');
  const empty=path.join(f.temporary,'abandoned.json');fs.writeFileSync(empty,'[]');
  f.command(['report',a.id,'--outcome','abandoned','--evidence-file',empty]);
  assert.equal(f.command(['dependency-check',b.id]).data.dependencies[0].state,'blocked');
});

test('squash mapping requires explicit human attestation', t => {
  const f = lab(t);
  const a = f.start('squashed',['--worktree']).data;
  fs.writeFileSync(path.join(a.workspace.path,'feature.txt'),'feature');
  git(a.workspace.path,'add','feature.txt');
  git(a.workspace.path,'-c','user.name=Test','-c','user.email=test@invalid','commit','-qm','feature');
  git(f.repo,'merge','--squash',a.branch);
  git(f.repo,'-c','user.name=Test','-c','user.email=test@invalid','commit','-qm','squash');
  const commit = git(f.repo,'rev-parse','HEAD');
  assert.equal(f.command(['merged',a.id,'--commit',commit],{},4).error.code,'merge_mapping_required');
  assert.equal(f.command(['merged',a.id,'--commit',commit,'--attest']).data.mergedCommit,commit);
});

test('same-workspace handoff permits uncommitted content and rejects stale content', async t => {
  const {createHash}=await import('node:crypto');
  const f=lab(t);
  const a=f.start('sequential-a',['--workspace',f.repo]).data;
  fs.writeFileSync(path.join(f.repo,'file.txt'),'verified uncommitted work');
  verifyCandidate(f,a);
  const head=git(f.repo,'rev-parse','HEAD');
  const handoff=path.join(f.temporary,'handoff.json');
  fs.writeFileSync(handoff,JSON.stringify({head,files:[{path:'file.txt',kind:'file',digest:createHash('sha256').update('verified uncommitted work').digest('hex')}]}));
  f.command(['handoff',a.id,'--file',handoff]);
  f.command(['finish',a.id]);
  fs.writeFileSync(path.join(f.repo,'file.txt'),'changed before acceptance');
  const b=f.start('sequential-b',['--workspace',f.repo,'--depends-on',a.id]).data;
  assert.equal(b.dependencies[0].policy,'workspace-handoff');
  assert.equal(b.dependencies[0].state,'waiting');
  assert.equal(git(f.repo,'rev-parse','HEAD'),head);
  fs.writeFileSync(path.join(f.repo,'file.txt'),'verified uncommitted work');
  assert.equal(f.command(['dependency-check',b.id]).data.dependencies[0].state,'ready');
});

test('simultaneous starts produce at most one complete rig in one workspace', async t => {
  const f=lab(t);
  const launch=name=>new Promise((resolve,reject)=>{
    const child=spawn(path.join(f.root,'bin/rig-job'),['start','project',name,'--repo',f.repo,'--workspace',f.repo,'--json'],{env:f.env});
    let stdout='',stderr='';child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
    child.on('error',reject);child.on('close',status=>resolve({status,stdout,stderr}));
  });
  const results=await Promise.all([launch('race-a'),launch('race-b')]);
  assert.equal(results.filter(r=>r.status===0).length,1,JSON.stringify(results));
  assert.equal(results.filter(r=>r.status===3).length,1,JSON.stringify(results));
  assert.equal(f.native().rows.length,4);
});

test('interrupted resume reconciles a running native rig without a second launch', t => {
  const f=lab(t); const job=f.start('resume-loss',['--workspace',f.repo]).data;
  f.command(['stop',job.id]);
  f.command(['resume',job.id],{TEST_FAIL_AFTER_UP:'1'},1);
  const count=f.calls().filter(c=>c[1]==='up').length;
  assert.equal(f.command(['resume',job.id]).data.lifecycle,'running');
  assert.equal(f.calls().filter(c=>c[1]==='up').length,count);
});

test('explicit finish can retire partial seats from a recorded failed launch', t => {
  const f=lab(t);
  const fail=f.start('partial',['--workspace',f.repo],{TEST_FAIL_AFTER_UP:'1'},1);
  const state=f.native();state.rows=state.rows.slice(0,2);fs.writeFileSync(f.env.TEST_NATIVE,JSON.stringify(state));
  assert.equal(f.command(['finish',fail.error.jobId]).data.lifecycle,'finished');
  assert.equal(f.native().rows.length,0);
});

test('user deletion of project instructions is preserved at finish', t => {
  const f=lab(t);fs.writeFileSync(path.join(f.repo,'AGENTS.md'),'Human rules\n');
  const job=f.start('deleted-rules',['--workspace',f.repo]).data;
  fs.unlinkSync(path.join(f.repo,'AGENTS.md'));
  f.command(['finish',job.id]);
  assert.equal(fs.existsSync(path.join(f.repo,'AGENTS.md')),false);
});

test('foreign seats cannot operate a job or spawn siblings', t => {
  const f=lab(t);const a=f.start('owner',['--workspace',f.repo]).data;
  const b=f.start('other',['--worktree']).data;
  const env={OPENRIG_NODE_ID:b.seats[1].nodeId};
  assert.equal(f.command(['tell',a.id,'--message','foreign'],env,3).error.code,'wrong_job_caller');
  assert.equal(f.start('unauthorized',['--worktree'],env,3).error.code,'spawn_not_allowed');
});

test('sequential handoff accepts prerequisite content once and permits dependent edits', async t => {
  const {createHash}=await import('node:crypto');
  const f=lab(t);const a=f.start('handoff-source',['--worktree']).data;
  const content='retained prerequisite';fs.writeFileSync(path.join(a.workspace.path,'file.txt'),content);
  verifyCandidate(f,a);
  const file=path.join(f.temporary,'handoff.json');
  fs.writeFileSync(file,JSON.stringify({head:git(a.workspace.path,'rev-parse','HEAD'),files:[{path:'file.txt',kind:'file',digest:createHash('sha256').update(content).digest('hex')}]}));
  f.command(['handoff',a.id,'--file',file]);f.command(['finish',a.id]);
  const b=f.start('handoff-target',['--workspace',a.workspace.path,'--depends-on',a.id]).data;
  assert.equal(b.dependencies[0].policy,'workspace-handoff');
  assert.equal(b.dependencies[0].state,'ready');
  fs.writeFileSync(path.join(a.workspace.path,'file.txt'),'dependent implementation');
  assert.equal(f.command(['dependency-check',b.id]).data.dependencies[0].state,'ready');
});

test('installed native client preserves claimed provenance for ordinary shell queue writes', async t => {
  const f=lab(t);
  const source=`
import {DaemonClient} from ${JSON.stringify(pathToFileURL(path.join(installedPackage,'dist/client.js')).href)};
import {requireSenderIdentity} from ${JSON.stringify(pathToFileURL(path.join(installedPackage,'daemon/dist/routes/require-sender-identity.js')).href)};
const client=new DaemonClient('http://127.0.0.1:1',{fetchImpl:async(url,options)=>{
 const headers=new Headers(options.headers);const body=JSON.parse(options.body);
 if(headers.has('X-OpenRig-Session'))throw new Error('Unexpected seat impersonation');
 const identity=requireSenderIdentity({req:{header:()=>undefined},json:(data,status)=>({data,status})},{bodyClaim:body.sourceSession});
 return new Response(JSON.stringify(identity),{status:200,headers:{'Content-Type':'application/json'}});
}});
const result=await client.post('/api/queue/create',{sourceSession:'openrig-teams-shell'});
console.log(JSON.stringify(result.data));`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{env:f.env,encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{ok:true,session:'openrig-teams-shell',provenance:'claimed:v1'});
});

test('malformed native inventory blocks startup before preparation', t => {
  const f=lab(t);fs.writeFileSync(f.env.TEST_NATIVE,JSON.stringify({rows:[{rigName:'unknown'}],queue:[]}));
  assert.equal(f.start('malformed',['--worktree'],{},1).error.code,'invalid_inventory');
  assert.equal(fs.existsSync(path.join(f.repo,'.worktrees')),false);
});

test('a selected base revision is checked for generated-file collisions before branch creation', t => {
  const f=lab(t);f.settings({runtime:'claude-code'});
  git(f.repo,'checkout','-qb','unsafe-base');
  fs.writeFileSync(path.join(f.repo,'.mcp.json'),'{}');git(f.repo,'add','.mcp.json');
  git(f.repo,'-c','user.name=Test','-c','user.email=test@invalid','commit','-qm','tracked generated target');
  git(f.repo,'checkout','main');
  assert.equal(f.start('unsafe-base-job',['--worktree','--base','unsafe-base'],{},2).error.code,'tracked_projection_collision');
  assert.equal(git(f.repo,'branch','--list','feature/unsafe-base-job'),'');
});

test('continuation under a fleet seat reuses the original shell-authored brief', t => {
  const f=lab(t);const job=f.start('cross-caller',['--workspace',f.repo,'--brief','Original assignment']).data;
  f.fleet(['create','recovery']);f.fleet(['add','recovery',job.id]);f.fleet(['take','recovery','--seat',job.leadAddress]);
  fs.writeFileSync(path.join(f.env.OPENRIG_TEAMS_CONFIG,'config.env'),'FLEET_MAY_SPAWN=1\n');
  const file=path.join(f.env.OPENRIG_TEAMS_STATE,'jobs',job.id,'manifest.json');
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));saved.lifecycle='failed';saved.setup=saved.setup.filter(s=>s!=='briefed');saved.attempt='briefed';fs.writeFileSync(file,JSON.stringify(saved));
  const before=f.calls().length;
  assert.equal(f.command(['continue',job.id],{OPENRIG_SESSION_NAME:job.leadAddress}).data.lifecycle,'running');
  assert.equal(f.calls().slice(before).some(c=>c[1]==='queue' && c[2]==='create'),false);
  assert.equal(f.native().queue.filter(q=>q.qitemId===job.briefQueueId).length,1);
});
