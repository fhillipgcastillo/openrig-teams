# AGENTS.md — set up openrig-teams on a machine and a project

Instructions for an agent (Claude Code or any other) asked to set this up.
Work through the parts in order. Each step ends with a check; do not move on
until it passes. The human owns every decision marked **ask**.

Paths below are relative to this repository's root unless stated.

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
   Check: it prints `agents/shared -> …/daemon/specs/agents/shared` and the
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
2. **Learn the project's rules for new checkouts.** Read the project's
   `CLAUDE.md` / `AGENTS.md` / `README` / `CONTRIBUTING` for: how worktrees
   are created, how dependencies get into a new checkout, which env files are
   needed, and how to run servers or tests in isolation (own ports). Part 3
   uses these answers.

## Part 3 — A job (per job)

One job = one worktree = one branch. Teams never run in the project's main
checkout (`bin/rig-team` refuses it).

1. **Create the worktree.**
   - If the project has its own worktree tooling (a `make` target, a script, a
     skill named in its `CLAUDE.md`), use it. Example, skoolscout-com:
     `make worktree-new SLOT=auto NAME=<job> BRANCH=<branch>`.
   - Otherwise, plain git, outside the project folder:
     ```sh
     git -C <project> worktree add ../<project>-worktrees/<job> -b <branch> <base-branch>
     ```
   The worktree's folder name becomes part of the team name, so use a short job
   slug.
2. **Make the worktree runnable** the way the project says: install or link
   dependencies, copy or link gitignored env files. A fresh worktree has none of
   the main checkout's untracked files.
3. **Start only the departments the job needs.**
   ```sh
   bin/rig-team fe <worktree> plan    # must print: Status: planned
   bin/rig-team fe <worktree> up      # and/or be, devops
   ```
   Check: `rig ps --nodes -A` lists `team-builder@fe-<project>-<job>` and its
   reviewer and tester.
4. **Hand the job to the lead.**
   ```sh
   rig send control-lead@lead "<the job, the worktree path, what done means>"
   ```
5. **Finish.** The human reviews and merges the branch. Then:
   ```sh
   bin/rig-team fe <worktree> remove
   ```
   Remove the worktree with the project's tooling or `git worktree remove
   <worktree>`, only after the human confirms the branch is merged or
   abandoned.

## Rules while setting up

- Never commit, push or open PRs in the project or in this repository unless
  the human asks.
- Never start, stop or reset the human's own running services, databases or
  rigs.
- Builders and testers prompt on every non-`rig` shell command until auto mode
  is configured (see README → Pending). Do not answer another seat's permission
  prompts; tell the human which seat is waiting.
