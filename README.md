# openrig-teams

Reusable complete teams for [OpenRig](https://openrig.dev), with an independent lead, builder, reviewer, and tester for each job. Use an existing checkout or an optional Git worktree. Supports Codex, Claude Code, mixed seats, and project templates with OpenRig 0.6.4.

```text
Any assistant ──▶ job tools ──▶ Job A rig ──▶ existing checkout
                          └──▶ Job B rig ──▶ project/.worktrees/feature-b
Optional fleet manager ──────▶ each job's lead and native queues
```

One unfinished job reserves one workspace. A competing request names the occupant and offers using its rig or requesting a separate worktree. Stopping keeps that reservation; finishing releases it. No global lead is required.

## Setup

Follow [setup](docs/setup.md) to install OpenRig and authenticate the selected coding CLIs. Preview `bin/setup --plan`, then save the same runtime and approval choices with `bin/setup`. Setup also links OpenRig's shared AgentSpec resources. Rerun after changing Node or OpenRig versions. No rig launch is needed during setup.

## Start a job

Run these wrappers from this repository. Replace the example project path and brief:

```sh
bin/rig-job start myproject feature-a --repo /path/to/project --workspace /path/to/project --brief "Implement A; done means …" --plan
bin/rig-job start myproject feature-a --repo /path/to/project --workspace /path/to/project --brief "Implement A; done means …"
```

For a separate branch and checkout, choose `--worktree` instead of `--workspace`:

```sh
bin/rig-job start myproject feature-b --repo /path/to/project --worktree --brief "Implement B; done means …" --plan
bin/rig-job start myproject feature-b --repo /path/to/project --worktree --brief "Implement B; done means …"
```

The default directory is `/path/to/project/.worktrees/feature-b`. Local Git exclusions hide generated files and this directory without changing the project's `.gitignore`. Existing checkout mode preserves the current branch, staged changes, and user files. Managed mode refuses an existing branch/path.

Commands return a job UUID and its unique lead address. Use the UUID for later operations:

```sh
bin/rig-job list
bin/rig-job status JOB_UUID
bin/rig-job tell JOB_UUID --message "Update the acceptance criteria …"
bin/rig-job stop JOB_UUID
bin/rig-job resume JOB_UUID
bin/rig-job finish JOB_UUID --plan
bin/rig-job finish JOB_UUID
```

Finish keeps the workspace and branch. Explicit `finish JOB_UUID --worktree` removes an owned worktree; `--detach-worktree` unregisters it while preserving files. Both retain the branch. Existing checkouts cannot be removed/detached by these tools. Dirty worktree deletion fails without forcing removal. Use `continue JOB_UUID` for an interrupted start, and inspect any ambiguity reported before changing resources.

See the [test walkthrough and command reference](docs/job-rigs.md), [project configuration](docs/project-profile.md), [agent workflow skill](skills/job-rigs/SKILL.md), and [implementation blueprint](docs/blueprints/2026-10-09-independent-job-rigs.md).

## Optional fleet

An ordinary assistant can list jobs, inspect attention requests, and relay instructions at any time. Persistent native coordination is optional:

```sh
bin/rig-fleet create features
bin/rig-fleet add features JOB_UUID
bin/rig-fleet up features --plan
bin/rig-fleet up features
bin/rig-fleet status features
bin/rig-fleet release features
```

`up` creates a native manager seat in its own state-directory home. Alternatively `take features --seat ADDRESS` selects an existing native seat; selection does not attach the calling assistant. Use native attachment/handover for occupation. Release ends coordination and leaves all sessions, jobs, and queues intact. External CLI seats poll queues because their native binding has no inbound pane transport.

Separate-workspace dependencies require a human merge and the merged revision in the dependent workspace. Sequential work in one checkout can use verified retained content after retiring the previous job, without manufacturing a commit. See [dependency examples](docs/job-rigs.md#dependencies).

## Configuration and boundaries

Machine runtime/approval choices remain in `~/.config/openrig-teams/runtime.json`. Project hooks live in `projects/<name>.sh`; project templates, seat models/runtimes/approvals, and environment limitations can live in `.openrig-teams/project.json`. Resolved instances retain their original choices on resume.

State defaults to `~/.local/state/openrig-teams`, overridable with `OPENRIG_TEAMS_STATE` or `XDG_STATE_HOME`. Native OpenRig owns seat identity, task queues, attachment, and handover. Ordinary shell queue writes use its installed client/API and declared `claimed:v1` provenance; managed seats use native CLI identity. Local records track workspace ownership, frozen configuration, verification evidence, and dependencies. Do not give concurrent controllers different state roots.

This round does not isolate ports, databases, dependencies, or machine resources. Projects must supply their own preparation/isolation policy. Shared continuous learning is tracked as a [future external integration](docs/shared-knowledge-integration-idea.md). Tools never start or reset user services.

Approval modes keep native restrictions. Claude preferences saved after initial launch apply on a subsequent launch; no automatic restart occurs. The fleet seat may change job lifecycle only with separately saved `FLEET_MAY_SPAWN=1`; job leads cannot spawn siblings. No seat approves another seat's prompts.

## Legacy workflow

`bin/rig-home`, `bin/rig-team`, and `bin/rig-job-legacy` retain the department/global-lead workflow. Existing `rig-job … --teams …` commands and old non-UUID finish commands route to that implementation. For compatibility, an old start lacking both workspace flags also retains legacy behavior; use an explicit workspace mode for all new complete jobs. Legacy doctor/exclude checks are stricter about tracked instruction files. Existing rigs and profiles are not migrated or stopped automatically.

## Validation

```sh
node --test tests/*.test.mjs
```

Tests use temporary Git repositories, the installed native schemas/managed-block helpers, and a mocked daemon. Native interactive harness behavior still needs the [live walkthrough](docs/job-rigs.md). Historical live findings retain their original version/date in [findings](docs/findings.md).
