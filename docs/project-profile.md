# Project profile — what a project needs to tell rig-job

A profile teaches `bin/rig-job` how one project creates and prepares a worktree.
It lives **outside this repo**, in `~/.config/openrig-teams/projects/<project>.sh`
(`$OPENRIG_TEAMS_CONFIG` or `$XDG_CONFIG_HOME` change the base), because it holds
machine and project specifics. Without a profile, `rig-job start --repo <path>`
uses plain git. Create one with `bin/rig-job profile-init <project>`, check it with
`bin/rig-job doctor <project>`.

## Questions to answer

| Question | Profile field |
|---|---|
| Where is the main checkout? | `PROJECT_PATH` |
| Which branch do jobs branch from? | `BASE_BRANCH` (default: the main checkout's current branch) |
| Which departments does a typical job use? | `DEFAULT_TEAMS` (`fe`, `be,fe`, …) |
| How does the project create a worktree: its own tooling, or plain git? Where do worktrees live, and does the folder name carry meaning (slot numbers, ports)? | `profile_create_worktree`, must set `WORKTREE` |
| What gitignored or untracked **instruction** files must the seats see (private `AGENTS.md` / `CLAUDE.local.md` content, notes)? | `COPY_FILES`: copied once, never symlinked, because OpenRig manages `AGENTS.md` for Codex and `CLAUDE.local.md` for Claude |
| What does a fresh worktree lack to run: dependencies, env files, secrets, certs, generated artifacts? For each: copy, link, or install? | `profile_prepare_worktree` |
| Does the project isolate running stacks (ports, databases, slots)? How does a worktree claim its share? | in `profile_create_worktree` |
| How is a worktree removed, and is anything archived or dropped first? | `profile_remove_worktree` |
| Which instruction files do the selected CLIs load, and is a deliberate bridge needed? | `profile_prepare_worktree`; preserve project content and resolve generated-file collisions before launch |
| Does the project **track** any path OpenRig writes (`AGENTS.md`, `CLAUDE.local.md`, `.mcp.json`, `.openrig/`, selected `.agents/`, `.codex/`, or `.claude/` artifacts)? | `doctor` reports it; resolve before starting teams |

## Rules of thumb

- **Link** what must stay in sync with the main checkout (shared secrets, certs).
  For npm-based projects, **hardlink** (`cp -al`) large dependency folders when
  that is appropriate. For pnpm projects, let pnpm manage package links and use
  its shared store when preparing each worktree, so dependencies do not need to
  be fetched from scratch. **Copy** what the seat or OpenRig will modify;
  **install** nothing without the human.
- Report a missing source (`MISS`) and continue; never regenerate secrets.
- Never start servers or databases from a profile. Teams may do it only when a
  job says so, through the project's isolation tooling.
- Every mutating command in a hook goes through `run`, so `--plan` only prints.
- Hooks may use `say`, `die`, and the variables `PROJECT_PATH BASE_BRANCH JOB
  BRANCH PLAN WORKTREE`.

## Instructions and runtime selection

Machine runtime and approval choices live in `runtime.json`, separate from the
project profile; see [setup](setup.md). A project can use mixed teams without
maintaining duplicate role templates. `rig-job` determines the selected teams'
effective runtimes and passes their union to `rig-exclude`.
Previous artifact exclusions remain so jobs using another runtime do not expose
generated files in existing worktrees.

Read the project's `AGENTS.md`, `CLAUDE.md`, and any local instructions before
choosing how fresh worktrees receive them. This repository's `CLAUDE.md`
imports `@AGENTS.md`; a project may need a different deliberate arrangement.
Never generically overwrite or copy tracked instruction files. A tracked
`AGENTS.md` collides with Codex's generated target; a tracked `CLAUDE.local.md`
collides with this configuration's Claude target. Resolve such conflicts with
the human before starting seats. Exclusions hide untracked artifacts; they do
not make tracked targets safe to overwrite.

Use `bin/rig-exclude <project> --runtime codex`, `--runtime claude-code`, or
`--runtime both` when checking manually. The default is `both`; the
[generated-files table](setup.md#project-instructions-and-generated-files)
lists what each runtime writes. Instruction bridging remains the profile's
responsibility, and belongs in the prepared worktree rather than a generic
change to the main checkout.
