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
| What gitignored or untracked **instruction** files must the seats see (a private `CLAUDE.local.md`, notes)? | `COPY_FILES`: copied once, never symlinked, because OpenRig appends its own block to `CLAUDE.local.md` |
| What does a fresh worktree lack to run: dependencies, env files, secrets, certs, generated artifacts? For each: copy, link, or install? | `profile_prepare_worktree` |
| Does the project isolate running stacks (ports, databases, slots)? How does a worktree claim its share? | in `profile_create_worktree` |
| How is a worktree removed, and is anything archived or dropped first? | `profile_remove_worktree` |
| Does the project **track** any path OpenRig writes (`CLAUDE.local.md`, `.mcp.json`, `.openrig/`, `.claude/settings.local.json`, `.claude/skills/…`)? | `doctor` reports it; resolve before starting teams |

## Rules of thumb

- **Link** what must stay in sync with the main checkout (shared secrets, certs);
  **hardlink** (`cp -al`) large dependency folders; **copy** what the seat or
  OpenRig will modify; **install** nothing without the human.
- Report a missing source (`MISS`) and continue; never regenerate secrets.
- Never start servers or databases from a profile. Teams may do it only when a
  job says so, through the project's isolation tooling.
- Every mutating command in a hook goes through `run`, so `--plan` only prints.
- Hooks may use `say`, `die`, and the variables `PROJECT_PATH BASE_BRANCH JOB
  BRANCH PLAN WORKTREE`.
