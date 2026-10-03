# Codex setup

These templates use Codex CLI. Claude Code is not required.

1. Install OpenRig: `npm install -g @openrig/cli@0.6.4`.
2. Check `node --version` (24 for job-radar), `tmux -V`, `codex --version`,
   and `codex login status`.
3. Back up `~/.codex/config.toml` before the first launch. OpenRig adds workspace
   trust, activity hooks, and the selected Codex MCP configuration during launch.
4. Run `bin/setup` to link shared resources, create the local config folders,
   and install `profiles/openrig-auto.config.toml` into the active Codex home.
5. Run `bin/rig-home lead plan`, inspect its Codex launch plan, then
   `bin/rig-home lead up`. Check `rig ps --nodes --rig lead`.

Do not run bare `rig setup` on 0.6.4: it automatically attempts to install Claude
Code. No global tmux changes are required; mouse mode is already configured on
this machine.

## Auto-review for future launches

Every template member selects `codex_config_profile: openrig-auto`. Setup
installs the matching native profile as
`${CODEX_HOME:-$HOME/.codex}/openrig-auto.config.toml`:

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"
approvals_reviewer = "auto_review"
```

An identical existing file is kept; a differing file stops setup without being
overwritten. Native project/managed configuration can override or restrict
these values. Check the seat's native effective settings on launch. Already
running seats retain their current settings until a later restart/resume.

This selects Codex's independent approval reviewer. It does not make the lead
a permission broker, enable full bypass, or create a broad `rig` command rule.
Rejected actions and startup trust decisions can still require human input.
See [official auto-review documentation](https://learn.chatgpt.com/docs/sandboxing/auto-review).

The lead-mediated approval proposal is reserved for the separate session in
[`approval-design-session.md`](approval-design-session.md).

## job-radar

The machine-local profile is `~/.config/openrig-teams/projects/job-radar.sh`.
It branches from `main` and defaults to FE and BE teams. Override departments
with `--teams fe`, `--teams be`, or `--teams fe,be,devops` for a specific job.

Worktrees live in `~/repos/job-radar-worktrees/<job>`. The profile creates local
pnpm links with `pnpm install --offline --frozen-lockfile --ignore-scripts`, using
the existing store. It fails if dependencies are missing from the store; install
the required dependencies deliberately before retrying. Dependency folders are
not shared with the main checkout, and lifecycle scripts are not run.

The profile copies existing environment files and reports missing ones without
creating credentials. It seeds `AGENTS.md` from tracked `CLAUDE.md` if needed,
before OpenRig appends its managed blocks. `.git/info/exclude` hides only local
OpenRig artifacts; it does not change `.gitignore`.

The project has no isolated-stack tooling. The profile never starts services,
creates databases, runs migrations, or installs browsers. Unit checks can run
inside the worktree. Live service and database checks require explicit task
authorization and a separately configured stack with distinct ports and data.

```sh
bin/rig-job doctor job-radar
bin/rig-job start job-radar <job> --teams fe,be --plan
bin/rig-job start job-radar <job> --teams fe,be
```

Give the lead the job only when the human requests it. No job is automatically
created by project onboarding. `LEAD_MAY_SPAWN=0` remains the default.
