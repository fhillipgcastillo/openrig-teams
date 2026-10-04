# openrig-teams

Department teams for [OpenRig](https://openrig.dev), reusable across projects.
One lead talks to you; department teams (FE, BE, DevOps) are generated per git worktree from shared templates, so several jobs can run side by side.

Supports **Claude Code, Codex CLI, and mixed teams** with OpenRig **0.6.4**.
[Setup](docs/setup.md) saves your runtime and approval choices locally.

**Setting this up with an agent?** Hand it [`AGENTS.md`](AGENTS.md): machine
setup, onboarding a project, and running a job, each step with a check.

## The idea

```
                       ┌─────────────┐
            you ──────▶│    LEAD     │  rigs/lead   (runs in homes/lead, outside any repo)
                       └──────┬──────┘  + optional PM: rigs/pm (homes/pm)
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │ FE team   │──────▶ │ BE team   │        │ DevOps    │
   │ builder   │  hand  │ builder   │        │ operator  │
   │ reviewer  │  off   │ reviewer  │        │           │
   │ tester    │        │ tester    │        │           │
   └───────────┘        └───────────┘        └───────────┘
   one copy per job, each inside that job's worktree
```

- **One job = one worktree = one branch.** A department team for a job runs
  inside that job's worktree; reviewer and tester read the builder's copy.
- **The lead never writes and never reads project folders.** It delegates and
  reports. It lives in `homes/lead`, so one lead serves every project.
- **Project rules come from the project.** Seats start inside the worktree, so
  they load its instructions and skills for the selected CLI. The templates hold
  only roles; the project profile handles any instruction bridge.
- **You merge.** No seat commits, pushes, opens PRs or touches release metadata
  (see `culture/CULTURE.md`).

## Layout

```
bin/
  setup        create every machine-specific link and folder (run after clone)
  rig-home     lead / pm: plan | up | down | resume | remove | name | permissions
  rig-team     per worktree: plan | up | down | resume | remove | name | permissions
  rig-job      start | finish | can-spawn | profile-init | doctor — the one entry point for jobs
  rig-runtime  render saved runtime/approval choices; validate launch prerequisites
  rig-exclude  once per project: hide OpenRig's files in all its worktrees (.git/info/exclude)
rigs/<team>/rig.yaml          shared team templates; wrappers render your saved runtime choices
rigs/<team>/CULTURE.md        link → culture/CULTURE.md, created by bin/setup (gitignored)
agents/<dept>/<role>/         agent.yaml + guidance/role.md per seat
agents/shared                 link to OpenRig's built-in shared skills, created by bin/setup (gitignored)
culture/CULTURE.md            rules every seat follows
homes/                        working folders for lead / pm (gitignored)
docs/findings.md              what was tested, what is verified, what is not
AGENTS.md                     step-by-step setup for an agent: machine, project, job
CLAUDE.md                     imports AGENTS.md for Claude Code
docs/setup.md                 runtime, approval, and mixed-team setup
docs/project-profile.md       what a project profile has to decide
profiles/_template.sh         starting point for a profile
```

## One-time setup

1. Follow [setup](docs/setup.md) to install OpenRig and authenticate your selected
   CLI(s). Back up the selected harness configuration before first launch.
2. Run `bin/setup --plan` to choose runtime and approval preferences, then
   `bin/setup` with the same choices to save them. Equivalent flags support noninteractive
   setup, including per-seat overrides for mixed teams.
3. Preview with `bin/rig-home lead plan`, then launch with `bin/rig-home lead up`.
   Rerun setup after upgrading OpenRig or switching Node versions.

Use the wrappers to apply saved preferences. Direct launches of tracked
`rig.yaml` templates use their Codex baseline instead.

## Daily workflow

```
0. bin/rig-exclude <project>                  once per project (see AGENTS.md Part 2)
1. bin/rig-home lead up                       start the lead (once; keep it running)
2. bin/rig-job start <project> <job> --teams fe[,be,devops] [--plan] [--brief "<job>"]
                                              branch + worktree + untracked files + teams
3. rig send control-lead@lead "<the job>"     (or use --brief above)
4. review the branch and merge it yourself
5. bin/rig-job finish <project> <job> --teams fe [--worktree]
```

`rig-job` is the one entry point for both you and any agent, so the steps are
never assembled by hand. By hand, the same thing is: project tooling for the
branch and worktree, `bin/rig-exclude`, then `bin/rig-team <team> <worktree> up`.

`rig tui` shows everything; `rig ps --nodes -A` lists every seat address.

### Config and project profiles (outside this repo)

`~/.config/openrig-teams/` (created by `bin/setup`) is machine-local and never
tracked (`OPENRIG_TEAMS_CONFIG` or `XDG_CONFIG_HOME` can change the base):

```
runtime.json                default runtime, per-runtime approvals, per-seat overrides
config.env                  LEAD_MAY_SPAWN=0   the lead may run rig-job only when 1
projects/<project>.sh       how that project creates and prepares a worktree
```

A profile holds the project's path and base branch, the untracked files to copy
into each worktree (`COPY_FILES`), and optional hooks to create, prepare and
remove the worktree. `bin/rig-job profile-init <project>` starts one from
`profiles/_template.sh`; `docs/project-profile.md` lists what to decide;
`bin/rig-job doctor <project>` checks it. Without a profile, `--repo <path>`
uses plain git.

`LEAD_MAY_SPAWN` is enforced by the script, which reads the calling seat's
`OPENRIG_SESSION_NAME`: with 0 the lead is refused; builders, reviewers and
testers are always refused; a human shell has no such variable and is allowed.

### Names

Generated teams are named `<team>-<project>-<worktree folder>`, seats
`team-<role>@<that name>`:

```
bin/rig-team fe <path>/worktree-rapid-river-5846 name     (worktree of skoolscout-com)
→ fe-skoolscout-com-worktree-rapid-river-5846
→ seats team-builder@…, team-reviewer@…, team-tester@…
```

The project part comes from the repo's main checkout folder, so two projects
with same-named worktrees never collide. `rig-team` refuses a main checkout.

### Actions

| Action | `rig-team` / `rig-home` does |
|---|---|
| `plan` | write a separate ignored `.plan.yaml`; preview launch and deferred Claude permission steps |
| `up` | render saved choices and launch; save Claude approval choices for the next launch |
| `down` | stop with a snapshot (keeps the record) |
| `resume` | verify existing seat runtimes, apply Claude approval choices, then relaunch by name |
| `remove` | stop, delete the record, delete the generated spec |
| `name` | print the rig name only |
| `permissions` | verify existing seat runtimes and explicitly save Claude approval preferences |

Earlier live testing is recorded in [findings](docs/findings.md), with its
original version/date and verification limits. Current automated tests use
temporary configurations and mocked lifecycle commands; they do not prove
native interactive approval behavior.

## Portability

Nothing committed depends on this machine. Everything that does is created by
`bin/setup` and gitignored:

| Created by setup | Why it can't be committed |
|---|---|
| `agents/shared` → OpenRig's shared skills | lives inside the global package folder, which depends on the Node manager (nvm, system, bun) and version. Setup finds it by following the `rig` binary to its installed package |
| `rigs/*/CULTURE.md` → `culture/CULTURE.md` | OpenRig requires the culture file beside `rig.yaml` (no `..` paths); git can check symlinks out as plain files on some systems |
| `homes/lead`, `homes/pm` | per-machine working folders; OpenRig writes the selected harnesses' managed instructions and resources there |

Also per machine, outside this repo: selected CLI authentication, native
workspace trust and hooks, and saved runtime/approval preferences.
Team files use only relative agent references (`local:../../agents/...`), and
the scripts locate the repo from their own position, so the clone can live
anywhere.

## Cost

The previous Claude setup measured ~310 MB per `claude` process, ~660 MB with
its MCP servers. Codex memory use has not been measured. Each seat uses your
plan's allowance. Lead + one FE job is 4
seats; a full-stack job adds 3 more. Start only the departments a job needs
and `remove` them when the branch is done.

## Permissions

Choose `native` or `auto` per runtime, with optional seat overrides. Codex auto
uses the optional `openrig-auto` profile; native adds no named profile. Claude
native records `floor`; Claude auto records OpenRig's native `auto` selection.
Native and managed rules remain in effect.

Claude preferences are saved after the first launch and apply on a subsequent
launch. `permissions` saves them explicitly; `resume` saves them before launch.
There are no automatic restarts. Changing harnesses or Codex profiles requires
newly generated rigs; resuming keeps those stored choices. Existing Claude
seats can change approval mode through `permissions` / `resume` after runtime
verification. See [setup and approval timing](docs/setup.md#approval-modes-and-existing-seats).

No full bypass, broad command allowance, or lead permission broker is enabled.
Auto-review can reject actions, and startup trust or native restrictions can
still require human input. Lead spawning remains a separate local choice,
disabled by default.

The separate approval-design discussion prompt is in
[`docs/approval-design-session.md`](docs/approval-design-session.md).
