import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { loadSettings, findOpenRigPackage, executablePath, codexProfilePath, writeAtomic } from './runtime-config.mjs';
import { root, demand, run, git } from './job-tools.mjs';
import { jobDir } from './job-state.mjs';
import { digest } from './job-project.mjs';

export async function nativeSupport() {
  const installed = findOpenRigPackage();
  const yaml = createRequire(path.join(installed, 'package.json'))('yaml');
  const { RigSpecSchema } = await import(pathToFileURL(path.join(installed, 'daemon/dist/domain/rigspec-schema.js')));
  const managed = await import(pathToFileURL(path.join(installed, 'daemon/dist/domain/managed-blocks.js')));
  return { yaml, RigSpecSchema, ...managed };
}

export async function resolveRig(project, options) {
  const support = await nativeSupport();
  const templatePath = path.resolve(project.repo, options.template || project.config.template || path.join(root, 'rigs/job/rig.yaml'));
  const source = fs.readFileSync(templatePath, 'utf8');
  const spec = support.yaml.parse(source);
  const settings = loadSettings();
  const overrides = project.config.seats || {};
  const keys = [];
  const seats = [];
  for (const pod of spec.pods || []) for (const member of pod.members || []) {
    const key = `${pod.id}.${member.id}`;
    keys.push(key);
    const override = overrides[key] || {};
    demand(Object.keys(override).every(k => ['runtime', 'model', 'approval'].includes(k)), 'invalid_seat_override', `Unknown override field for ${key}`);
    const runtime = override.runtime || settings.runtime || member.runtime;
    const approval = override.approval || settings.approvals[runtime];
    demand(['codex', 'claude-code'].includes(runtime) && ['native', 'auto'].includes(approval), 'invalid_seat_override', `Invalid runtime/approval for ${key}`);
    const model = override.model ?? member.model ?? null;
    demand(model === null || (typeof model === 'string' && model.length > 0 && !/[\r\n]/.test(model)), 'invalid_model', `Invalid model for ${key}`);
    member.runtime = runtime;
    member.cwd = '.';
    if (model !== null) member.model = model;
    delete member.codex_config_profile;
    if (runtime === 'codex' && approval === 'auto') member.codex_config_profile = 'openrig-auto';
    demand(typeof member.agent_ref === 'string' && /^(local:|path:)/.test(member.agent_ref), 'invalid_agent_ref', `Use a local/path AgentSpec for ${key}`);
    const ref = member.agent_ref;
    const location = ref.startsWith('local:') ? path.resolve(path.dirname(templatePath), ref.slice(6)) : ref.slice(5);
    demand(fs.existsSync(path.join(location, 'agent.yaml')), 'missing_agent', `AgentSpec missing at ${location}`);
    member.agent_ref = `path:${location}`;
    seats.push({ pod: pod.id, member: member.id, address: '', nodeId: null, runtime, model, approval });
  }
  demand(options.fleet ? keys.includes('control.manager') : keys.includes('control.lead') && seats.some(s => s.member === 'reviewer') && seats.some(s => s.member === 'tester'), 'incomplete_template', options.fleet ? 'Fleet template requires control.manager' : 'Complete job template requires control.lead, reviewer and tester seats');
  demand(Object.keys(overrides).every(key => keys.includes(key)), 'invalid_seat_override', 'Project overrides name a seat absent from the selected template');
  spec.managed_blocks = { 'claude-code': 'CLAUDE.local.md' };
  const cultureSource = spec.culture_file ? path.resolve(path.dirname(templatePath), spec.culture_file) : path.join(root, 'culture/JOB-CULTURE.md');
  const culture = fs.readFileSync(cultureSource, 'utf8');
  spec.culture_file = 'CULTURE.md';
  const validation = support.RigSpecSchema.validate(spec);
  demand(validation.valid, 'invalid_template', validation.errors.join('; '));
  for (const runtime of new Set(seats.map(s => s.runtime))) executablePath(runtime === 'codex' ? 'codex' : 'claude');
  if (seats.some(s => s.runtime === 'codex' && s.approval === 'auto')) {
    const profile = codexProfilePath();
    demand(fs.existsSync(profile) && fs.readFileSync(profile).equals(fs.readFileSync(path.join(root, 'profiles/openrig-auto.config.toml'))), 'codex_profile_missing', 'Run bin/setup with Codex auto or resolve the installed profile conflict');
    run('codex', ['-p', 'openrig-auto', 'mcp', 'list']);
  }
  return { templatePath, templateDigest: digest(source + culture), spec, culture, seats };
}

export function renderRig(job, resolution) {
  const spec = structuredClone(resolution.spec);
  spec.name = job.rigName;
  fs.writeFileSync(path.join(path.dirname(job.specPath), 'CULTURE.md'), resolution.culture, { mode: 0o600 });
  return nativeSupport().then(({ yaml }) => writeAtomic(job.specPath, yaml.stringify(spec)));
}

export function artifactPaths(seats) {
  const paths = ['.openrig/'];
  const skills = new Set();
  const directories = fs.readdirSync(path.join(root, 'agents'), { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'shared');
  for (const dir of directories) for (const member of fs.readdirSync(path.join(root, 'agents', dir.name))) {
    const file = path.join(root, 'agents', dir.name, member, 'agent.yaml');
    if (fs.existsSync(file)) for (const skill of fs.readFileSync(file, 'utf8').matchAll(/skills: \[([^\]]*)\]/g)) for (const name of skill[1].split(',').map(s => s.trim()).filter(Boolean)) skills.add(name);
  }
  if (seats.some(s => s.runtime === 'codex')) paths.push('AGENTS.md', '.codex/plugins/shared:openrig-core/', ...[...skills].map(s => `.agents/skills/${s}/`));
  if (seats.some(s => s.runtime === 'claude-code')) paths.push('CLAUDE.local.md', '.mcp.json', '.claude/settings.local.json', '.claude/plugins/shared:openrig-core/', ...[...skills].map(s => `.claude/skills/${s}/`));
  return paths;
}

export async function checkArtifacts(workspace, seats, revision = null) {
  const paths = artifactPaths(seats);
  const tree = revision ? git(workspace, 'ls-tree', '-r', '-z', revision, '--', ...paths).split('\0').filter(Boolean) : [];
  const tracked = [...new Set([...git(workspace, 'ls-files', '-z', '--', ...paths).split('\0').filter(Boolean), ...tree.map(entry => entry.split('\t')[1])])];
  demand(!tree.some(entry => entry.startsWith('120000 ') && ['AGENTS.md', 'CLAUDE.local.md'].includes(entry.split('\t')[1])), 'unsafe_instruction_target', 'Selected base contains a symlink instruction target');
  const unsafe = tracked.filter(file => !['AGENTS.md', 'CLAUDE.local.md'].includes(file));
  demand(unsafe.length === 0, 'tracked_projection_collision', `Tracked generated targets would be modified: ${unsafe.join(', ')}`);
  for (const file of ['AGENTS.md', 'CLAUDE.local.md']) {
    const target = path.join(workspace, file);
    if (fs.lstatSync(target, { throwIfNoEntry: false })) demand(fs.lstatSync(target).isFile(), 'unsafe_instruction_target', `${target} must be a regular file, not a symlink`);
  }
}

export function excludeArtifacts(job) {
  const file = path.join(job.commonDir, 'info/exclude');
  const begin = '# >>> openrig-teams';
  const end = '# <<< openrig-teams';
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const previous = existing.match(/# >>> openrig-teams\n([\s\S]*?)# <<< openrig-teams/)?.[1].split('\n').filter(Boolean) || [];
  const paths = new Set([...previous, ...artifactPaths(job.seats)]);
  const nested = path.relative(job.repo, job.workspace.path);
  if (job.workspace.owned && nested.startsWith('.worktrees/')) paths.add('/.worktrees/');
  const kept = existing.replace(/# >>> openrig-teams\n[\s\S]*?# <<< openrig-teams\n?/g, '');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, `${kept}${kept && !kept.endsWith('\n') ? '\n' : ''}${begin}\n${[...paths].sort().join('\n')}\n${end}\n`);
}

export function snapshotInstructions(job, replace = false) {
  const file = path.join(jobDir(job.id), 'instructions.json');
  if (!replace && fs.existsSync(file)) return;
  const snapshot = {};
  for (const name of ['AGENTS.md', 'CLAUDE.local.md']) {
    const target = path.join(job.workspace.path, name);
    snapshot[name] = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  }
  writeAtomic(file, JSON.stringify(snapshot));
}

export async function verifyInstructions(job) {
  const { stripManagedBlocks } = await nativeSupport();
  const snapshot = JSON.parse(fs.readFileSync(path.join(jobDir(job.id), 'instructions.json'), 'utf8'));
  for (const [name, original] of Object.entries(snapshot)) {
    const file = path.join(job.workspace.path, name);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    demand(stripManagedBlocks(current) === stripManagedBlocks(original || ''), 'instruction_content_changed', `Launch changed project content outside managed blocks in ${name}; inspect the workspace and recorded snapshot`, 1);
  }
}

export async function restoreInstructions(job) {
  const file = path.join(jobDir(job.id), 'instructions.json');
  if (!fs.existsSync(file)) return;
  const { stripManagedBlocks } = await nativeSupport();
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [name, original] of Object.entries(snapshot)) {
    const target = path.join(job.workspace.path, name);
    if (!fs.existsSync(target)) {
      if (original === '') fs.writeFileSync(target, original);
      continue;
    }
    demand(fs.lstatSync(target).isFile(), 'unsafe_instruction_target', `Instruction target changed to a symlink: ${target}`, 3);
    const current = fs.readFileSync(target, 'utf8');
    if (stripManagedBlocks(current) !== stripManagedBlocks(original || '')) continue;
    if (original !== null) fs.writeFileSync(target, original);
    else fs.unlinkSync(target);
  }
}
