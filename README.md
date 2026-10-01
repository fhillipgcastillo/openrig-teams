# openrig-teams

Department teams for [OpenRig](https://openrig.dev), reusable across projects.
One lead talks to you; department teams (FE, BE, DevOps) are generated per git
worktree from shared templates, so several jobs can run side by side.

Built and tested against OpenRig **0.6.3**, Claude Code only (no Codex).

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
  they load that repo's `CLAUDE.md` and skills. The templates hold only roles.
- **You merge.** No seat commits, pushes, opens PRs or touches release metadata
  (see `culture/CULTURE.md`).

## Layout

```
bin/
  setup        create every machine-specific link and folder (run after clone)
  rig-home     lead / pm: plan | up | down | resume | remove
  rig-team     fe / be / devops per worktree: plan | up | down | resume | remove | name
  rig-exclude  once per project: hide OpenRig's files in all its worktrees (.git/info/exclude)
rigs/<team>/rig.yaml          team templates (all with managed_blocks → CLAUDE.local.md)
rigs/<team>/CULTURE.md        link → culture/CULTURE.md, created by bin/setup (gitignored)
agents/<dept>/<role>/         agent.yaml + guidance/role.md per seat
agents/shared                 link to OpenRig's built-in shared skills, created by bin/setup (gitignored)
culture/CULTURE.md            rules every seat follows
homes/                        working folders for lead / pm (gitignored)
docs/findings.md              what was tested, what is verified, what is not
AGENTS.md                     step-by-step setup for an agent: machine, project, job
```

## One-time setup

1. `npm install -g @openrig/cli` and `rig setup` (back up `~/.claude.json`,
   `~/.claude/settings.json` and `~/.tmux.conf` first).
2. Allow `rig` commands without prompts, in `~/.claude/settings.json`:
   ```json
   "permissions": { "allow": ["Bash(rig:*)"] }
   ```
3. `bin/setup` — run after every clone, and again after upgrading OpenRig or
   switching Node versions.

## Daily workflow

```
0. bin/rig-exclude <project>                  once per project (see AGENTS.md Part 2)
1. bin/rig-home lead up                       start the lead (once; keep it running)
2. create the job's worktree                  with the project's own tooling
3. bin/rig-team fe <worktree> up              start only the departments the job needs
   bin/rig-team be <worktree> up              (full-stack: both on the same worktree)
4. rig send control-lead@lead "<the job>"     the lead dispatches through the queue
5. review the branch and merge it yourself
6. bin/rig-team fe <worktree> remove          stop + delete the job's team(s)
   remove the worktree
```

`rig tui` shows everything; `rig ps --nodes -A` lists every seat address.

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
| `plan` | write the generated spec and preview the launch |
| `up` | write the generated spec and launch |
| `down` | stop with a snapshot (keeps the record) |
| `resume` | relaunch a stopped team by name (`rig up <name> --existing`) |
| `remove` | stop, delete the record, delete the generated spec |
| `name` | print the generated name only (`rig-team`) |

`down` / `resume` are wired to OpenRig's documented verbs but were not
exercised in testing — see `docs/findings.md`.

## Portability

Nothing committed depends on this machine. Everything that does is created by
`bin/setup` and gitignored:

| Created by setup | Why it can't be committed |
|---|---|
| `agents/shared` → OpenRig's shared skills | lives inside the global package folder, which depends on the Node manager (nvm, system, bun) and version. Setup finds it by following the `rig` binary, falling back to `npm root -g` |
| `rigs/*/CULTURE.md` → `culture/CULTURE.md` | OpenRig requires the culture file beside `rig.yaml` (no `..` paths); git can check symlinks out as plain files on some systems |
| `homes/lead`, `homes/pm` | per-machine working folders; OpenRig writes `CLAUDE.local.md`, `.claude/`, `.mcp.json`, `.openrig/` there |

Also per machine, outside this repo: `rig setup` (trust + hooks in
`~/.claude.json`), the `Bash(rig:*)` allow rule, and Claude Code logged in.
Team files use only relative agent references (`local:../../agents/...`), and
the scripts locate the repo from their own position, so the clone can live
anywhere.

## Cost

Each running Claude seat measured ~310 MB for `claude` itself, ~660 MB with
its MCP servers, plus its share of your plan's usage. Lead + one FE job is 4
seats; a full-stack job adds 3 more. Start only the departments a job needs
and `remove` them when the branch is done.

## Pending

- **Auto mode for every seat.** Seats launch in `acceptEdits`. The lead runs
  prompt-free with the `Bash(rig:*)` rule, but builders and testers prompt on
  every non-`rig` shell command (tests, lint, `git diff`, file writes via
  shell), so teams can't run unattended yet. A team file cannot select `auto`
  (OpenRig only accepts `floor` / `full_bypass` there); it is per seat:
  `rig seat set-permissions <seat> --mode auto --reason "…"`, effective from
  the seat's next launch. Untested here; once confirmed, `rig-team up` should
  apply it to each new seat.
