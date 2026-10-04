# AGENTS.md — set up openrig-teams on a machine and a project

Instructions for an agent (Claude Code or any other) asked to set this up.
Work through the parts in order. Each step ends with a check; do not move on
until it passes. The human owns every decision marked **ask**.

Paths below are relative to this repository's root unless stated.

Before onboarding a project or changing runtimes/approvals, read the relevant
entry in [lessons-learned.md](lessons-learned.md). Machine choices belong in
local configuration; project choices belong in its profile.

## Part 1 — Machine (once per machine)

1. **Prerequisites.** Follow [setup](docs/setup.md) for the supported OpenRig
   version, Node, tmux, and the selected coding CLI(s). Verify authentication
   for each selected CLI. Never install or configure an unselected CLI.
2. **Back up configuration.** Back up the selected harnesses' user configuration
   before a first launch. Inspect native and managed permission settings.
   Do not add broad permission allowlists as part of this setup.
3. **Choose and preview local preferences.** Run `bin/setup --plan` interactively,
   or supply the runtime and approval flags documented in [setup](docs/setup.md).
   Check that the selected runtimes and approval modes match the human's request.
   Apply with the same choices and no `--plan`. Setup creates links, folders,
   and `runtime.json`; existing project profiles and spawn authorization remain.
   Rerun after upgrading OpenRig or switching Node versions.
4. **Preview and launch the lead.** Use the wrappers so saved preferences apply:
   ```sh
   bin/rig-home lead plan
   bin/rig-home lead up
   ```
   Inspect the plan before launching. Check `rig ps --nodes --rig lead` for the
   selected runtime and seat state. Claude approval preferences are saved after
   initial launch and take effect on a subsequent launch; see [approval timing](docs/setup.md#approval-modes-and-existing-seats).
   If an existing rig occupies `lead`, **ask** before stopping or replacing it.

## Part 2 — Project (once per project)

Nothing is installed into the project. Teams start inside its worktrees and
load the project's instructions and skills for their selected runtimes. Two
things still need doing.

1. **Hide the files OpenRig writes into each worktree.** Select `codex`,
   `claude-code`, or `both` to match the runtimes the project will use:
   ```sh
   bin/rig-exclude <path-to-the-project> --runtime both
   ```
   See [generated files](docs/setup.md#project-instructions-and-generated-files)
   for the paths per runtime. `rig-job` supplies the union for its selected teams.
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
   Decide instruction bridging in that profile; never generically overwrite or
   copy tracked `AGENTS.md` / `CLAUDE.md` files.

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
   bin/rig-job finish <project> <job> --teams fe --detach-worktree  # keep files, remove Git link
   ```
   Removing the worktree is only with `--worktree`, and only after the human
   confirms. `--detach-worktree` keeps the folder and files while unregistering
   it from Git; use it when the files must remain. Both modes retain the branch.
   `start` refuses an existing branch before preparation or launch, so inspect
   the reported worktrees and choose another branch or clean up explicitly.

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
- Approval behavior follows the saved runtime/mode and native managed rules.
  Do not answer another seat's permission prompts; tell the human which seat
  is waiting. Auto does not grant the lead authority to approve other seats.
