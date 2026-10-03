# AGENTS.md — set up openrig-teams on a machine and a project

Instructions for an agent (Claude Code or any other) asked to set this up.
Work through the parts in order. Each step ends with a check; do not move on
until it passes. The human owns every decision marked **ask**.

Paths below are relative to this repository's root unless stated.

## Codex-only setup (takes precedence over the Claude machine steps below)

- Use Codex CLI for every seat; do not install or configure Claude Code.
- OpenRig 0.6.4's bare `rig setup` installs Claude automatically. Follow
  `docs/codex-setup.md` instead: verify Codex authentication, back up its config,
  run `bin/setup`, preview the lead, and launch it after the preview passes.
- Codex writes `AGENTS.md`, `.agents/skills/<skill>/`, `.codex/plugins/` and
  `.openrig/` in worktrees. `bin/rig-exclude` covers the installed role paths.
- Project profiles must preserve project instructions in `AGENTS.md` before
  launch. For `job-radar`, copy its tracked `CLAUDE.md` into the new worktree's
  `AGENTS.md`; keep the main checkout unchanged.
- The human selected Codex auto-review for these team templates. `bin/setup`
  installs `profiles/openrig-auto.config.toml` in the active Codex home; every
  member selects `codex_config_profile: openrig-auto`. Preserve stricter native
  and managed settings. Existing seats need a later restart/resume to use it.
- This choice does not grant the lead authority to approve another seat's
  prompts, enable full bypass, or enable job spawning. Adding broad command
  allowances still requires a separately scoped human choice.

## Part 1 — Machine (once per machine)

1. **Prerequisites.** OpenRig supports macOS and Linux (WSL2 works but is
   officially untested). Check:
   ```sh
   node --version      # 22 or 24
   tmux -V
   claude --version    # Claude Code installed and logged in
   ```
2. **Install OpenRig.**
   ```sh
   npm install -g @openrig/cli
   rig --version
   ```
3. **Back up, preview, apply `rig setup`.** It writes workspace trust and hooks
   into the human's harness config, with no complete rollback.
   ```sh
   mkdir -p ~/openrig-backup-$(date +%F)
   cp ~/.claude.json ~/.claude/settings.json ~/.tmux.conf ~/openrig-backup-$(date +%F)/ 2>/dev/null
   rig setup --dry-run
   ```
   **Ask** the human to approve the dry-run plan, then run `rig setup`.
4. **Allow `rig` commands without prompts.** Add to `permissions.allow` in
   `~/.claude/settings.json` (create the `permissions` key if missing; keep the
   file valid JSON):
   ```json
   "permissions": { "allow": ["Bash(rig:*)"] }
   ```
   Check: `node -e 'console.log(require(process.env.HOME+"/.claude/settings.json").permissions)'`.
5. **Link this repo to the installed OpenRig.**
   ```sh
   bin/setup
   ```
   Check: it prints `agents/shared -> …/daemon/specs/agents/shared`, the config
   folder (`~/.config/openrig-teams`, with `config.env` and `projects/`) and the
   `rig` version. Rerun after upgrading OpenRig or switching Node versions.
6. **Start the lead.**
   ```sh
   bin/rig-home lead plan     # must print: Status: planned
   bin/rig-home lead up
   ```
   Check: `rig ps --nodes --rig lead` shows `control-lead@lead` as `idle`, not
   `needs-input`. If the name `lead` is already taken by another rig, **ask**
   before stopping it.

## Part 2 — Project (once per project)

Nothing is installed into the project. Teams start inside its worktrees and
read the project's own `CLAUDE.md` and skills from there. Two things still need
doing.

1. **Hide the files OpenRig writes into each worktree.** Every launch creates
   `CLAUDE.local.md`, `.mcp.json`, `.openrig/`, `.claude/settings.local.json`,
   `.claude/plugins/shared:openrig-core/` and one `.claude/skills/<skill>/` per
   role skill. Without this step they show as untracked files on every job
   branch.
   ```sh
   bin/rig-exclude <path-to-the-project>
   ```
   This writes a marked block into the repository's shared `.git/info/exclude`:
   local to this machine, never committed, applies to every worktree of that
   repository, and safe to rerun. It never edits the project's `.gitignore`.
   Check: exit 0 and `updated …/info/exclude`. Exit 2 means the project
   **tracks** some of those paths, which an exclude cannot hide and OpenRig
   would overwrite; nothing was written, the paths are listed, and you
   **ask** the human before starting any team on this project.
2. **Write the project's profile** (skip when plain git is enough). Read the
   project's
   `CLAUDE.md` / `AGENTS.md` / `README` / `CONTRIBUTING` for: how worktrees
   are created, how dependencies get into a new checkout, which env files are
   needed, and how to run servers or tests in isolation (own ports). Put the answers in the
   profile (`docs/project-profile.md` lists what to decide); Part 3 uses it.

## Part 3 — A job (per job)

One job = one worktree = one branch. Use **`bin/rig-job`**; do not assemble the
raw git and rig steps yourself. It creates the branch and worktree (through the
project's profile when there is one), copies the untracked files the profile
lists, runs `rig-exclude`, and starts the teams.

1. **Preview.**
   ```sh
   bin/rig-job start <project> <job> --teams fe --plan
   ```
   Read it. `<project>` is the profile name (`~/.config/openrig-teams/projects/`);
   with no profile add `--repo <path-to-main-checkout>`. Check a profile with
   `bin/rig-job doctor <project>`; create one with `bin/rig-job profile-init
   <project>` and fill it using `docs/project-profile.md`.
2. **Start.** Same command without `--plan`. Add `--brief "<what to do>"` to
   also message the lead. Check: `rig ps --nodes -A` lists
   `team-builder@fe-<project>-<job>` with its reviewer and tester.
3. **Hand the job to the lead** if you did not use `--brief`:
   ```sh
   rig send control-lead@lead "<the job, the worktree path, what done means>"
   ```
4. **Finish** once the human has merged or abandoned the branch:
   ```sh
   bin/rig-job finish <project> <job> --teams fe             # stop the teams
   bin/rig-job finish <project> <job> --teams fe --worktree  # and remove the worktree
   ```
   Removing the worktree is only with `--worktree`, and only after the human
   confirms.

Who may run it: the human, or any agent they ask. The lead may run it only when
`bin/rig-job can-spawn` prints `yes`, which needs `LEAD_MAY_SPAWN=1` in
`~/.config/openrig-teams/config.env` (default 0). No other seat can.

Manual route, the same steps by hand: create the branch and worktree with the
project's own tooling, make it runnable, `bin/rig-exclude <project>`, then
`bin/rig-team <fe|be|devops> <worktree> up`.

## Rules while setting up

- Never commit, push or open PRs in the project or in this repository unless
  the human asks.
- Never start, stop or reset the human's own running services, databases or
  rigs.
- Builders and testers prompt on every non-`rig` shell command until auto mode
  is configured (see README → Pending). Do not answer another seat's permission
  prompts; tell the human which seat is waiting.
