import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { configDir } from './runtime-config.mjs';
import { demand, git, run, workspaceRoot, prospectivePath } from './job-tools.mjs';
import { validName } from './job-state.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');

function assignment(text, key, vars = {}) {
  const match = text.match(new RegExp(`^${key}=([^\\n]*)$`, 'm'));
  if (!match) return null;
  let value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return value.replace(/\$\{([A-Z_]+)\}|\$([A-Z_]+)/g, (whole, a, b) => vars[a || b] ?? whole);
}

export function loadProject(name, options) {
  validName(name);
  const profilePath = path.join(configDir(), 'projects', `${name}.sh`);
  const profile = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf8') : '';
  const projectPath = options.repo || assignment(profile, 'PROJECT_PATH', { HOME: process.env.HOME });
  demand(projectPath && !/[`$\n]/.test(projectPath), 'project_path_required', 'Supply --repo PATH or a literal PROJECT_PATH in the project profile; previews never execute shell configuration');
  const repo = workspaceRoot(projectPath);
  const commonDir = fs.realpathSync(git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
  const configFile = path.join(repo, '.openrig-teams/project.json');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : { version: 1 };
  demand(config.version === 1, 'invalid_project', 'project.json version must be 1');
  const allowed = ['version', 'template', 'integrationBranch', 'worktreeDirectory', 'seats', 'environment'];
  demand(Object.keys(config).every(key => allowed.includes(key)), 'invalid_project', 'Unknown project.json field');
  if (config.seats !== undefined) demand(config.seats && typeof config.seats === 'object' && !Array.isArray(config.seats), 'invalid_project', 'Project seats must be an object');
  const main = git(repo, 'worktree', 'list', '--porcelain').split('\n').find(line => line.startsWith('worktree '))?.slice(9);
  demand(main, 'invalid_repository', 'Cannot identify the main checkout');
  return {
    name, repo, main, commonDir, config, profile, profilePath: profile ? profilePath : null,
    profileDigest: profile ? digest(profile) : null,
    base: options.base || assignment(profile, 'BASE_BRANCH') || git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'),
    repeatable: assignment(profile, 'PREPARE_REPEATABLE') === '1',
  };
}

export function targetWorkspace(project, options, name) {
  if (options.workspace) {
    const target = workspaceRoot(options.workspace);
    demand(fs.realpathSync(git(target, 'rev-parse', '--path-format=absolute', '--git-common-dir')) === project.commonDir, 'wrong_repository', 'Existing workspace must belong to the selected repository');
    return { mode: 'existing', path: target, owned: false };
  }
  demand(project.repo === project.main, 'main_checkout_required', 'Managed worktree creation requires --repo pointing to the main checkout');
  let target = path.resolve(project.repo, project.config.worktreeDirectory || '.worktrees', name);
  if (/^profile_create_worktree\s*\(/m.test(project.profile)) {
    const declared = assignment(project.profile, 'WORKTREE_PATH', { PROJECT_PATH: project.repo, JOB: name, HOME: process.env.HOME });
    demand(declared && !/[`$\n]/.test(declared), 'worktree_path_required', 'Custom profile_create_worktree requires literal WORKTREE_PATH (PROJECT_PATH/JOB substitutions allowed) for safe preflight');
    target = path.resolve(project.repo, declared);
  }
  return { mode: 'managed-worktree', path: prospectivePath(target), owned: true };
}

export function checkProfile(job) {
  if (!job.profilePath) return;
  demand(fs.existsSync(job.profilePath) && digest(fs.readFileSync(job.profilePath)) === job.profileDigest, 'profile_changed', 'Project profile changed after creation; restore the recorded profile before continuing', 3);
}

export function profileHook(job, hook) {
  if (!job.profilePath) return false;
  checkProfile(job);
  const text = fs.readFileSync(job.profilePath, 'utf8');
  if (!new RegExp(`^${hook}\\s*\\(`, 'm').test(text)) return false;
  const program = `set -euo pipefail
run() { "$@"; }
say() { printf '%s\\n' "$*" >&2; }
die() { printf '%s\\n' "$*" >&2; exit 1; }
PROJECT_PATH=$2; JOB=$3; BRANCH=$4; BASE_BRANCH=$5; WORKTREE=$6; PLAN=0
. "$1"
${hook}
printf '\\nOPENRIG_TEAMS_WORKTREE=%s\\n' "$WORKTREE"
`;
  const output = run('bash', ['-c', program, 'job-profile', job.profilePath, job.repo, job.name, job.branch || '', job.baseCommit, job.workspace.path], { cwd: job.workspace.owned && hook === 'profile_create_worktree' ? job.repo : job.workspace.path });
  const returned = output.split('\n').findLast(line => line.startsWith('OPENRIG_TEAMS_WORKTREE='))?.slice('OPENRIG_TEAMS_WORKTREE='.length);
  demand(returned && prospectivePath(returned) === job.workspace.path, 'profile_workspace_changed', 'Profile changed WORKTREE from its declared reserved path', 3);
  return true;
}

export function copyProfileFiles(job) {
  if (!job.profilePath) return;
  const program = `set -euo pipefail
COPY_FILES=()
. "$1"
printf '%s\\0' "\${COPY_FILES[@]}"
`;
  const output = run('bash', ['-c', program, 'job-profile', job.profilePath], { cwd: job.workspace.path });
  for (const rel of output.split('\0').filter(Boolean)) {
    demand(!path.isAbsolute(rel) && !rel.split('/').includes('..'), 'unsafe_copy_path', `Invalid COPY_FILES path ${rel}`);
    const src = path.join(job.repo, rel);
    const dest = path.join(job.workspace.path, rel);
    if (!fs.existsSync(dest) && fs.existsSync(src)) fs.cpSync(src, dest, { recursive: true, dereference: false });
  }
}
