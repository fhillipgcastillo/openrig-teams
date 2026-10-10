# Complete job rigs: test walkthrough and operations

A job is one complete native rig assigned exclusively to a Git workspace. Its lead owns implementation, independent review, and testing. Ordinary assistants can launch/query/relay; fleet coordination is optional. Commands below run from the openrig-teams clone; substitute your project paths and returned UUIDs.

## Before live testing

Complete [machine setup](setup.md), authenticate selected CLIs, and inspect project instructions/preparation. A new rig has four seats by default. Each consumes CLI allowance and machine resources. This implementation does not isolate ports or databases; do not run concurrent application stacks without the project's isolation policy.

The automated suite uses real temporary Git repositories and native schemas/managed-block helpers with a mocked daemon:

```sh
node --test tests/*.test.mjs
```

A sandbox that denies executing temporary files requires approval to run these isolated tests outside that sandbox. Automated success does not establish native interactive approval/attachment behavior.

## First live job in an existing checkout

```sh
bin/rig-job start demo first --repo /path/to/project --workspace /path/to/project --brief "Inspect the feature and propose a small verified change; do not commit" --plan
bin/rig-job start demo first --repo /path/to/project --workspace /path/to/project --brief "Inspect the feature and propose a small verified change; do not commit"
bin/rig-job list --json
bin/rig-job status JOB_UUID
```

Check the returned workspace/branch, native lead/builder/reviewer/tester identities, and durable brief. Existing checkout mode creates/switches no branch and retains user changes. Native startup can still show trust or permission prompts. Status exposes native seat activity and tagged queues separately from the recorded outcome; idle is not proof of completion.

Try previewing a second job on the same workspace. It must refuse with the occupant and options to use that rig or request a separate worktree. No alternative is performed automatically.

```sh
bin/rig-job start demo second --repo /path/to/project --workspace /path/to/project --plan
bin/rig-job tell JOB_UUID --message "Adjust the requirement: …"
```

## A parallel managed worktree job

```sh
bin/rig-job start demo parallel --repo /path/to/project --worktree --brief "Separate independent task; done means …" --plan
bin/rig-job start demo parallel --repo /path/to/project --worktree --brief "Separate independent task; done means …"
```

Check `project/.worktrees/parallel`, branch `feature/parallel`, and a distinct `job-parallel-UUID` rig. The main checkout and worktree have independent reservations. An existing linked checkout can also be used with `--workspace PATH`; it remains user-owned regardless of where it lives.

`--branch REF`, `--base REF`, and `--template PATH` customize new managed jobs. Branch/base are prohibited in existing mode. Plans do not reserve paths or execute profiles; launch repeats checks.

## Stop, recover, and finish

```sh
bin/rig-job stop JOB_UUID --plan
bin/rig-job stop JOB_UUID
bin/rig-job resume JOB_UUID --plan
bin/rig-job resume JOB_UUID
bin/rig-job finish JOB_UUID --plan
bin/rig-job finish JOB_UUID
```

Stop retains the reservation. Resume verifies native identities and frozen settings. `continue JOB_UUID` reconciles a failed/preparing start using completed checkpoints and the original profile. An interrupted nonrepeatable preparation or missing ambiguous native launch is blocked for inspection. Error JSON carries the failed job UUID.

Finish retires only the recorded rig and releases the workspace while retaining files and branch. Explicit `finish UUID --worktree` removes an owned worktree through its profile or Git; dirty deletion fails. `finish UUID --detach-worktree` removes its Git registration/link while preserving other files. Both retain the branch. Cleanup flags on an existing checkout fail before stopping its rig.

State uses a directory lock. An interrupted process can leave it behind; inspect `.mutation-lock/owner.json` and confirm the owner is no longer active before explicitly removing that lock. Do not point concurrent controllers at different state roots. Native connectivity failures remain unknown and never trigger replacement.

## Attention and evidence

```sh
bin/rig-job attention JOB_UUID --kind decision --summary "Choose API contract" --detail "Options, impact, and exact question" --request-id decision-unique-id
bin/rig-job answer JOB_UUID decision-unique-id --body "Use the existing contract"
bin/rig-job status JOB_UUID --json
```

Kinds are `decision`, `permission`, `failure`, and `progress`. Requests go to the selected active fleet manager, otherwise the job lead. They remain discoverable through job tags in native queues. A human channel can be explicitly supplied with `--destination ADDRESS --evidence-ref PATH`; native delivery policy controls it. Managed callers write through the native CLI. Ordinary shell writes use the installed native DaemonClient/API, declaring `openrig-teams-shell` with native `claimed:v1` provenance; they never impersonate a rig seat. The native CLI alone requires a seat environment for queue writes. Replies append a native note and create a response for the lead. A textual permission response never approves a native prompt.

The lead records an outcome with an evidence JSON array:

```json
[
  {"author":"verify-reviewer@job-NAME-UUID","kind":"review","summary":"Reviewed the candidate","reference":"review evidence"},
  {"author":"verify-tester@job-NAME-UUID","kind":"test","summary":"Relevant checks passed","reference":"test evidence"}
]
```

```sh
bin/rig-job report JOB_UUID --outcome verified --evidence-file /path/to/evidence.json
```

Use actual addresses returned by the job. Verified requires distinct recorded reviewer and tester authors and ready dependencies. Other outcomes: `unassigned`, `working`, `waiting-human`, `waiting-dependency`, `abandoned`. Outcome and native session state are separate. Completion does not commit, merge, or retire the rig automatically.

## Optional fleet manager

```sh
bin/rig-fleet create features
bin/rig-fleet add features JOB_A_UUID
bin/rig-fleet add features JOB_B_UUID
bin/rig-fleet up features --plan
bin/rig-fleet up features
bin/rig-fleet status features
bin/rig-fleet release features
```

`up` creates a separate native manager in a state-directory home, or reconciles the same recorded instance. `take features --seat ADDRESS` instead selects an existing native seat; it does not convert the caller into its occupant. Each job belongs to at most one fleet. Job leads retain their own ownership.

For an unbound native external seat, occupation uses `rig attach --self --rig RIG --node LOGICAL_ID`. For occupant replacement, `bin/rig-fleet handover features --source fresh --plan` previews native handover; other sources are native discovered/fork/rebuild forms. Report the native result. External CLI bindings can poll queues but lack inbound tmux transport; use a managed pane for active native nudges. No wrapper daemon supplies monitoring when every session is closed.

Release sets coordination inactive and preserves the manager reference, sessions, jobs, and queues. An ordinary assistant can inspect jobs later and select the same seat again. A managed fleet seat needs local `FLEET_MAY_SPAWN=1` to change job lifecycle. Job leads cannot spawn sibling rigs. This authorization never permits approving another seat's prompts.

## Dependencies

Start dependent jobs with repeated `--depends-on PREREQUISITE_UUID`. While waiting, the brief permits independent investigation only. The tools gate readiness and verified outcomes; the lead must respect the gate during implementation.

For different workspaces, the human merges the prerequisite into the configured integration branch, then declares the resulting commit:

```sh
bin/rig-job merged PREREQUISITE_UUID --commit MERGED_REVISION
bin/rig-job dependency-check DEPENDENT_UUID
```

Readiness also requires that revision in the dependent checkout's HEAD ancestry. Updating that checkout remains an explicitly directed Git operation; the wrapper does not merge/rebase/cherry-pick. Squash/rebase mappings require `merged … --attest` after human confirmation. “Done” messages alone do not open the gate.

For sequential jobs in the same existing checkout, verify the predecessor and record retained content before finishing it:

```json
{
  "head":"FULL_CURRENT_HEAD_SHA",
  "files":[
    {"path":"src/feature.ts","kind":"file","digest":"SHA256_OF_EXACT_FILE_CONTENT"},
    {"path":"removed-file.ts","kind":"absent","digest":null}
  ]
}
```

```sh
bin/rig-job handoff PREDECESSOR_UUID --file /path/to/handoff.json
bin/rig-job finish PREDECESSOR_UUID
bin/rig-job start demo next --repo /path/to/project --workspace /path/to/project --depends-on PREDECESSOR_UUID --brief "Continue from verified content"
```

The retained baseline is checked when accepted. Subsequent dependent implementation may edit it; content changed before acceptance blocks readiness. Reusing a finished managed checkout with `--workspace` follows this same handoff policy.

List all content the dependent task relies on; file digests can be computed with `sha256sum`. Symlink entries hash the link text. Paths cannot escape the workspace. The retired verified predecessor's HEAD and declared content must match; stale content blocks readiness. Uncommitted retained content is supported. There is no same-workspace commit/merge requirement.

## Scope and compatibility

Project template/settings and profile hooks are described in [project-profile.md](project-profile.md). Complete jobs preserve tracked instruction content around native managed blocks; unsafe tracked generated resources refuse launch. Legacy doctor/exclude remains stricter and is not the complete-job preflight.

Legacy department commands remain available with `--teams` or `bin/rig-job-legacy`. A legacy start omitting workspace flags retains old behavior for compatibility. Use explicit modes for complete jobs. No existing rig/profile is automatically migrated. Shared learning remains a [future external integration](shared-knowledge-integration-idea.md).
