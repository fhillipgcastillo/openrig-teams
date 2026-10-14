---
name: job-rigs
description: Launch, inspect, instruct, recover, and finish independent OpenRig job teams in existing checkouts or optional worktrees, with optional fleet coordination.
---

# Independent job teams

Locate this repository from this skill's directory and use its absolute `bin/rig-job`/`bin/rig-fleet` paths. Read `docs/job-rigs.md` for command contracts and `docs/project-profile.md` when preparation is needed. OpenRig must be installed and `bin/setup` completed for selected runtimes.

For assigned work, map the requested task and done criteria into a complete job brief. For a general rig with no current task, omit `--brief`; the job starts with an empty brief and `unassigned` outcome. Do not invent a task to fill it. Preserve the user's workspace choice: `--workspace PATH` uses their checkout; `--worktree` creates an optional linked checkout. If neither is inferable, ask which mode before launching; previews may be prepared first. Never use legacy `--teams` for a complete job.

Preview the exact start command with `--plan`, inspect prerequisites and environment limitations, then launch when already authorized. Use `--json` for machine-readable results. Retain the actual launch UUID and lead address; preview UUIDs are provisional and differ from the launched job. On `workspace_occupied`, present the occupant and options without taking either automatically. A native read failure is unknown and blocks replacement.

## Quick start for a general rig

Use the repository root inferred from this skill in place of `/path/to/openrig-teams`. Set PROJECT and checkout paths from the user's workspace; the example name `general` does not bypass workspace occupancy checks.

```sh
rig daemon status
/path/to/openrig-teams/bin/rig-job start PROJECT general --repo /path/to/project --workspace /path/to/project --plan --json
/path/to/openrig-teams/bin/rig-job start PROJECT general --repo /path/to/project --workspace /path/to/project --json
/path/to/openrig-teams/bin/rig-job status LAUNCHED_UUID --json
```

If the native OpenRig daemon is confirmed stopped, `rig daemon start` is a prerequisite for an authorized launch, subject to execution permissions. Recheck the preview afterward. An unreachable daemon or failed inventory read does not establish that a workspace is free. Do not restart a running daemon or introduce a wrapper daemon.

If sandbox restrictions produce `spawnSync ... EPERM` or read-only errors for OpenRig state, use the environment's escalation mechanism for the affected command. Do not change state roots, recreate jobs, or rerun setup to work around permissions. If a failed launch returned a job UUID, inspect it before retrying; use `continue` for recoverable setup.

## Runtime and model settings

Read existing configuration before changing it. Complete-job seat overrides belong in the project's `.openrig-teams/project.json`, keyed by `control.lead`, `dev.builder`, `verify.reviewer`, and `verify.tester` for the default template. Each accepts `runtime`, `model`, and `approval`. Machine defaults live in `runtime.json` under the openrig-teams configuration directory; its legacy department seat table does not select complete-job overrides. Use `docs/project-profile.md` for custom templates and preparation.

Resolve a requested latest model at launch time using current provider guidance and the installed runtime catalog; do not hard-code a dated model as permanently latest in this skill. Save the resolved model in project overrides when requested. Preserve other seat settings and runtimes.

The current wrapper has no per-seat reasoning-effort field. For Codex, inspect the effective configuration and selected profile rather than assuming the model default. Auto approval selects `openrig-auto`, whose installed fragment must match the bundled profile exactly; do not add reasoning settings to that fragment. Reasoning may be inherited from the user's Codex configuration, so a saved project model alone does not make reasoning portable. Report that dependency when relevant.

## Launch verification

Use `status LAUNCHED_UUID --json` to check the recorded lifecycle/outcome, each seat's live startup state and identity, model, workspace, and pending queue requests. For requested reasoning levels, verify actual session turn-context metadata (`model` and `effort`) when available, or inspect native captures with `rig capture --rig RIG_NAME --json`; do not expose unrelated transcript content. Report unavailable verification explicitly. An unassigned rig may perform startup orientation; activity does not itself mean a task was assigned.

Return the actual job UUID, lead address or native attach command, workspace, verified model/reasoning, and any pending requests. Keep reusable configuration and procedures separate from live facts: always recheck daemon state and occupancy.

For “how are things going?”, use list/status and show each job's recorded outcome, live seat activity, evidence, and tagged attention requests. Read native pending state; do not invent completion from an idle pane. For “ask the lead to change X”, use tell. For a human decision use answer with the request's qitem ID. A permission answer relays intent but does not approve native prompts.

An ordinary assistant needs no global identity to query/relay. If asked to coordinate persistently, create a fleet, add job UUIDs, and preview optional `rig-fleet up`. An existing native seat can instead be selected with take; native attachment/handover controls its occupant. External CLI bindings poll queues. Release ends coordination only. Do not introduce leases, credentials, a daemon, or a mandatory global lead.

Use continue for failed setup and resume for stopped jobs. Preserve frozen settings and inspect ambiguous checkpoints; never blindly recreate a rig. Finish releases the workspace only after retirement. Removal/detachment applies only to an owned worktree with explicit authorization; preserve dirty files and branches.

Dependent work follows dependency-check readiness. Cross-workspace integration belongs to the human. Same-workspace sequential work can retain verified uncommitted content using handoff after the predecessor is retired. Do not manufacture a merge/commit requirement.

Use native queues and seat identity. Leave service isolation, machine resource scheduling, and shared memory to their separately scoped future work. Never approve another seat's permission prompts or start/reset user services.
