# AGENTS.md — set up and operate openrig-teams

Read [lessons-learned.md](lessons-learned.md) before onboarding projects or changing runtime/approval choices. Paths here are relative to this repository. Use [skills/job-rigs/SKILL.md](skills/job-rigs/SKILL.md) for natural-language job requests.

## Machine setup

1. Follow [setup](docs/setup.md) for OpenRig 0.6.4, Node, tmux, and selected coding CLIs. Verify authentication; never configure an unselected CLI.
2. Back up selected harness configuration before first launch. Inspect native/managed permissions; do not add broad allowlists.
3. Preview `bin/setup --plan`, then apply the same runtime/approval choices. Check shared-resource links and saved `runtime.json`. Rerun after upgrading OpenRig or changing Node. Existing profiles and authorization remain.

A global lead is optional legacy behavior. Do not launch one as a prerequisite for complete jobs. Never replace or stop an existing rig as part of setup.

## Project setup

Read the project's instructions, contribution guide, and environment setup. A plain Git project needs no profile. Otherwise use [project profiles](docs/project-profile.md) for preparation and `.openrig-teams/project.json` for complete templates, per-seat settings, integration branch, and environment limitations.

New complete jobs prepare the union of selected native resources and local Git exclusions. Tracked instruction text is preserved around native managed blocks. Other tracked generated targets refuse launch; do not bypass the refusal. Legacy `rig-exclude` and `doctor` retain their stricter checks. Never generically copy or overwrite tracked project instructions.

## A complete job

Choose one explicit workspace mode from the human request:

```sh
bin/rig-job start PROJECT NAME --repo /path/to/project --workspace /path/to/project --brief "Task and done criteria" --plan
bin/rig-job start PROJECT NAME --repo /path/to/project --worktree --brief "Task and done criteria" --plan
```

Read the selected plan, then execute the same command without `--plan` when launch is authorized. Existing mode creates/switches no branch; managed mode defaults to `project/.worktrees/NAME` with a new branch. Do not assemble raw lifecycle steps by hand.

If occupied, present the occupant and the options: use its rig or request a separate worktree job. Do not create a parallel rig, stop the occupant, or automatically choose an option. Unreachable native inventory means unknown; it never authorizes replacement.

Check the returned job UUID and native lead/builder/reviewer/tester seats with `bin/rig-job status UUID`. Use `tell UUID --message TEXT` for further instructions; requests/replies remain in native queues. `list` and `status` work from another assistant session without becoming a manager.

`stop UUID` retains the reservation; `resume UUID` retains resolved runtimes/models. `continue UUID` reconciles interrupted setup. `finish UUID` retires the rig and retains files/branch. Owned worktree removal or detachment requires explicit human authorization and the corresponding flag. Existing checkout cleanup is prohibited. Never force dirty worktree deletion.

## Optional fleet and dependencies

Use `rig-fleet create/add/status` for an aggregate inventory. `up` previews/creates an optional native manager; `take --seat ADDRESS` selects an existing seat but does not attach the caller. Native `rig attach --self` and seat handover own occupation. `release` ends coordination without stopping any rig or session. External CLI managers poll queues; managed panes support native nudges.

Managed seats may change job lifecycle only when they are a selected fleet manager and local `FLEET_MAY_SPAWN=1` permits it. Other job seats cannot spawn siblings. Human-directed ordinary assistants can use the tools.

Use `--depends-on UUID` for dependencies. Separate workspaces wait for human merge and availability of the integrated revision in the dependent checkout. Same-workspace sequential jobs require retired, verified retained content and a matching handoff. Do not commit/merge simply to satisfy a same-workspace dependency.

## Boundaries

- Never commit, push, open PRs, or author release metadata unless explicitly requested.
- Never start, stop, or reset the human's services, databases, or unrelated rigs.
- Never approve another seat's native permission prompts; identify the waiting seat to the human.
- Environment isolation and external continuous learning are deferred; document project limits without implementing a new scheduler/memory service.
- Keep legacy `--teams` operations explicit; they do not implement the complete-job ownership contract.
- Run isolated tests from [the walkthrough](docs/job-rigs.md); do not launch live rigs solely for verification.
