# Project configuration and preparation

Complete jobs work without a profile: supply `--repo PATH` and an explicit `--workspace PATH` or `--worktree`. Existing mode preserves the current branch and does not run worktree hooks. Managed worktrees default to `project/.worktrees/NAME` and a new `feature/NAME` branch.

## Complete-job project settings

Optional `.openrig-teams/project.json` belongs to the project. Example:

```json
{
  "version": 1,
  "integrationBranch": "main",
  "worktreeDirectory": ".worktrees",
  "seats": {
    "verify.reviewer": {"runtime": "claude-code", "model": "your-selected-model", "approval": "native"}
  },
  "environment": {
    "concurrentStacks": "unsupported",
    "notes": "Separate checkouts share local ports and database; do not run parallel stacks."
  }
}
```

`template` can select a project-relative complete native RigSpec. It must include `control.lead` and separate reviewer/tester seats. Change topology there and use project `seats` keyed by `pod.member` for runtime/model/approval overrides. Native model support and permissions still apply. Machine runtime/per-runtime approval defaults come from `runtime.json`; its legacy department seat keys do not select complete-job seat overrides. Resolved instances retain their configuration when resumed.

Templates use native local/path AgentSpec references and a nearby culture file. Rendered instances freeze the rig definition/culture and resolve AgentSpec locations; the referenced role resources remain files, so keep those resources available. Project instructions still govern project work.

## Complete-job shell profiles

Profiles live in `~/.config/openrig-teams/projects/NAME.sh`, with existing config-root overrides. `profile-init NAME` creates a legacy-compatible starting file; review it before use. New complete-job plans read literal declarations without sourcing the shell file. They do not execute hooks, print hypothetical hook output, install dependencies, or create state/exclusions.

Declare `PROJECT_PATH` literally (HOME substitution allowed), or supply `--repo`. `BASE_BRANCH` chooses the managed job base. A custom `profile_create_worktree()` requires `WORKTREE_PATH` declared predictably with PROJECT_PATH/JOB/HOME substitutions; the hook must create that exact checkout and retain `WORKTREE` at that path. Default Git creation needs no hook/declaration.

| Hook/field | Complete-job behavior |
|---|---|
| `COPY_FILES=(...)` | Copies missing untracked inputs for managed worktrees only; paths are workspace-relative |
| `profile_create_worktree()` | Managed mode only; creates declared linked checkout/branch relationship |
| `profile_prepare_worktree()` | Managed mode only; runs in the new workspace |
| `profile_prepare_existing_workspace()` | Existing mode only, when explicitly defined; runs in that checkout |
| `profile_remove_worktree()` | Explicit managed deletion only; must remove directory and Git registration |
| `PREPARE_REPEATABLE=1` | Allows retrying interrupted preparation; omit when preparation cannot safely repeat |

Mutating hooks receive `PROJECT_PATH`, `JOB`, `BRANCH`, `BASE_BRANCH`, `WORKTREE`, `PLAN=0`, and `run`, `say`, `die`. `BASE_BRANCH` is initialized to the frozen base commit before sourcing your profile; keep creation based on the intended revision. Keep declarations side-effect-free: the shell file may be sourced more than once during preparation. Existing mode does not copy worktree inputs or run worktree hooks. Profile changes block continuation until the original contract is restored.

Never start servers/databases or regenerate secrets in preparation. Document missing inputs and project isolation limits. No generic port/database allocation is provided this round. Native tracked AGENTS.md/CLAUDE.local.md content is preserved around managed blocks, with cleanup snapshots. Other tracked generated resources refuse launch. Local shared exclusions retain earlier runtime artifacts and hide the default `.worktrees/` directory without editing `.gitignore`.

`doctor` and standalone `rig-exclude` remain **legacy** validators: they source the shell contract and reject tracked managed instruction targets. Use complete-job `start … --plan` for its actual preflight. Custom hooks and runtime interactions still need a live project check.

---

# Legacy department profile reference

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
- `start` rejects an existing branch before calling hooks, including in plans.
- `finish --worktree` requires `profile_remove_worktree` to remove both the
  directory and its Git registration. A successful hook exit is verified.
- `finish --detach-worktree` bypasses removal hooks and keeps every file except
  the `.git` link. It temporarily moves the directory to a sibling holding
  folder, removes that specific Git registration, and restores the files.
  If restoration fails, the error names the holding path. It does not prune
  other worktrees, unlock registrations, or delete branches.

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
