---
name: job-rigs
description: Launch, inspect, instruct, recover, and finish independent OpenRig job teams in existing checkouts or optional worktrees, with optional fleet coordination.
---

# Independent job teams

Locate this repository from this skill's directory and use its absolute `bin/rig-job`/`bin/rig-fleet` paths. Read `docs/job-rigs.md` for command contracts and `docs/project-profile.md` when preparation is needed. OpenRig must be installed and `bin/setup` completed for selected runtimes.

Map the requested task and done criteria into a complete job brief. Preserve the user's workspace choice: `--workspace PATH` uses their checkout; `--worktree` creates an optional linked checkout. If neither is inferable, ask which mode before launching; previews may be prepared first. Never use legacy `--teams` for a complete job.

Preview the exact start command with `--plan`, inspect prerequisites and environment limitations, then launch when already authorized. Use `--json` for machine-readable results. Retain the returned UUID and lead address. On `workspace_occupied`, present the occupant and options without taking either automatically. A native read failure is unknown and blocks replacement.

For “how are things going?”, use list/status and show each job's recorded outcome, live seat activity, evidence, and tagged attention requests. Read native pending state; do not invent completion from an idle pane. For “ask the lead to change X”, use tell. For a human decision use answer with the request's qitem ID. A permission answer relays intent but does not approve native prompts.

An ordinary assistant needs no global identity to query/relay. If asked to coordinate persistently, create a fleet, add job UUIDs, and preview optional `rig-fleet up`. An existing native seat can instead be selected with take; native attachment/handover controls its occupant. External CLI bindings poll queues. Release ends coordination only. Do not introduce leases, credentials, a daemon, or a mandatory global lead.

Use continue for failed setup and resume for stopped jobs. Preserve frozen settings and inspect ambiguous checkpoints; never blindly recreate a rig. Finish releases the workspace only after retirement. Removal/detachment applies only to an owned worktree with explicit authorization; preserve dirty files and branches.

Dependent work follows dependency-check readiness. Cross-workspace integration belongs to the human. Same-workspace sequential work can retain verified uncommitted content using handoff after the predecessor is retired. Do not manufacture a merge/commit requirement.

Use native queues and seat identity. Leave service isolation, machine resource scheduling, and shared memory to their separately scoped future work. Never approve another seat's permission prompts or start/reset user services.
