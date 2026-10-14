# Spec: E5 fleet assignment

## Goal anchor

Use any coding assistant to launch a complete reusable OpenRig team in either an existing Git checkout or an optional managed worktree. Each job has its own lead and one exclusively assigned workspace. An optional fleet manager observes jobs and relays requests through native OpenRig identity, queues, and messaging. Closing an assistant session does not lose the job inventory, pending work, or handoffs.

- AC4 Jobs, resolved templates, preparation checkpoints, native identities, evidence, and dependencies remain queryable across sessions.
- AC7 Fleet management is optional. A stable native manager seat receives coordination; native attachment/handover controls occupation. Releasing the fleet assignment does not stop any session or job. Ordinary assistants can always query and relay.

## Contract

Interface: C6 fleet CLI.


### C1 State and ownership

State root: `${OPENRIG_TEAMS_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/openrig-teams}`. Files: `jobs/<uuid>/manifest.json`, `jobs/<uuid>/rig.yaml`, `jobs/<uuid>/instructions.json`, `fleets/<name>.json`. A state-root directory lock serializes short mutations and lifecycle operations; conflict fails without waiting or automatic lock removal. Atomic private JSON writes retain `version:1`. Job records are the reservation authority: preparing/running/stopped/failed reserve `workspace.path`; finished/removed/detached release it after confirmed retirement. Canonical workspace paths use realpath and Git checkout roots, so symlink/subdirectory aliases compare equally. Existing native inventory is additionally checked through `rig ps --nodes -A --full --json`; unreachable or malformed inventory is unknown and blocks launch. Wrapper UUIDs identify jobs, while native rig/node IDs remain OpenRig-owned opaque strings. No user work is discarded for lock recovery.

### C2 Job and project records

`Job` is `{version:1,id:string,project:string,repo:string,commonDir:string,name:string,branch:string|null,baseCommit:string,workspace:{mode:"existing"|"managed-worktree",path:string,owned:boolean},rigName:string,rigId:string|null,leadAddress:string,seats:Seat[],templatePath:string,templateDigest:string,specPath:string,profilePath:string|null,profileDigest:string|null,preparedRepeatable:boolean,setup:string[],attempt:string|null,lifecycle:"preparing"|"running"|"stopped"|"failed"|"finished"|"removed"|"detached",outcome:"unassigned"|"working"|"waiting-human"|"waiting-dependency"|"verified"|"abandoned",brief:string,briefQueueId:string,evidence:Evidence[],dependencies:Dependency[],handoff:object|null,integrationBranch:string,createdAt:string,updatedAt:string,error:string|null,mergedCommit?:string,mergeAttested?:boolean}`. `Seat` is `{pod:string,member:string,address:string,nodeId:string|null,runtime:"codex"|"claude-code",model:string|null,approval:"native"|"auto"}`. `Evidence` is `{author:string,kind:"review"|"test"|"progress"|"handoff",summary:string,reference:string|null,createdAt:string}`. Verified outcome requires distinct recorded review and test authors belonging to the rig. Native identity comes from `rig whoami --json`; ordinary env-less user-directed sessions may operate wrappers without adopting a seat.

Optional project `.openrig-teams/project.json`: `{version:1,template?:string,integrationBranch?:string,worktreeDirectory?:string,seats?:{"pod.member":{runtime?:string,model?:string,approval?:string}},environment?:{concurrentStacks:string,notes:string}}`. Project overrides apply after template and machine defaults; native restrictions always apply. Shell profiles remain in the existing config directory. New complete-job preview reads literal assignments only, never sources shell profiles. `--repo` can supply a nonliteral path explicitly. Mutating preparation uses existing hooks, but existing mode calls only an explicit `profile_prepare_existing_workspace`. Managed hooks may create/prepare/remove worktrees; custom creation requires a declarative `WORKTREE_PATH` matching the hook output. `PREPARE_REPEATABLE=1` permits an interrupted preparation retry; otherwise continuation refuses ambiguous retries. Profile digest changes block recovery until the original preparation contract is restored.

### C3 Complete rig rendering

Initial `rigs/job/rig.yaml` has `control.lead`, `dev.builder`, `verify.reviewer`, and `verify.tester`; role guidance is sent per seat. All work in the assigned workspace. Custom templates designate `control.lead` and include independent review/test seats. Native member `model` and `path:` agent references are used. Instance spec sits outside the workspace with absolute agent references and a copied relative culture file. Rendered configuration is saved once and reused on resume. Machine settings remain compatible with the existing runtime.json. Claude permission choices are recorded after initial launch and before resume, with the existing next-launch limitation. Codex auto requires the existing optional profile. Native schema validation and selected executable checks run before creation. Tracked instruction files are permitted only through managed-block merging; other tracked projection collisions refuse launch. Instructions are snapshotted before each launch/resume; after teardown original bytes are restored only if nonmanaged content is unchanged, otherwise user edits remain. No generic restore/reset is used.

### C4 Job CLI

New complete-job path: `bin/rig-job start PROJECT NAME (--workspace PATH|--worktree) [--repo PATH] [--template PATH] [--branch REF] [--base REF] [--brief TEXT] [--depends-on ID] [--plan] [--json]`. Only managed mode accepts branch/base options. Legacy `--teams`, old non-UUID finish calls, starts lacking both workspace flags, and existing profile/doctor entry points retain their old implementation. New complete jobs always select an explicit workspace mode. New UUID commands: `list [--project PROJECT]`, `status ID`, `continue ID`, `stop ID`, `resume ID`, `finish ID [--worktree|--detach-worktree]`, `tell ID --message TEXT`, `report ID --outcome VALUE --evidence-file PATH`; read/mutation commands accept `--json`, lifecycle mutations accept `--plan`. Unknown/conflicting flags fail.

Start preflights, reserves, creates managed resources if requested, prepares, snapshots instructions, renders, launches, verifies inventory, applies supported permissions, and queues a stable-ID brief to its lead. It records an attempt before each external effect; ambiguous creation is reconciled from exact recorded path/branch/rig and otherwise blocked. Continue never blindly relaunches an observed rig or repeats a nonrepeatable hook. Status is `{job:Job,live:{state:"running"|"stopped"|"absent"|"unknown",nodes:object[],error:string|null},queue:{items:object[],error:string|null}}`; native activity is retained in nodes. Unknown native state is never absence. Finish verifies rig retirement before cleanup/releasing reservation. All branches remain.

JSON results: `{ok:true,data:object|array}` or `{ok:false,error:{code:string,message:string,jobId:string|null,conflict?:{workspacePath:string,jobId:string|null,rigName:string|null,options:string[]}}}`. Exit 0 success, 1 execution/connectivity, 2 input/config, 3 conflict, 4 dependency blocked. `workspace_occupied` options are `use-existing-rig` and `request-worktree-job`. No automatic stop, takeover, or alternative launch.

### C5 Native coordination

`tell` creates a native qitem with `--destination LEAD --id STABLE_ID --tags job:ID,kind:instruction --body TEXT --summary TEXT --json`. Initial brief uses persisted `briefQueueId` for retry deduplication; continuation first observes an existing correctly tagged/destined qitem, preserving original authorship across caller changes. Managed callers use native CLI identity. The installed queue CLI rejects env-less writes; ordinary human-directed shells therefore use OpenRig's installed DaemonClient and native queue API with declared caller `openrig-teams-shell`, recorded by the native sender resolver as `claimed:v1`, without a seat header or impersonation. Native transport/authentication and ledger provenance stay authoritative. `attention ID --kind decision|permission|failure|progress --summary TEXT --detail TEXT [--destination ADDRESS]` queues a request to the designated fleet manager if present, otherwise the job lead, tagged `job:ID,attention:KIND`; it remains visible through status without a manager. An explicit registered human destination may be supplied with a durable evidence reference. `answer ID QITEM --body TEXT` appends an attributed native queue note and creates an idempotent lead reply qitem; it does not forge human identity, bypass native approval, or mark someone else's task complete. Lead/manager acknowledges through native queue claim/update/handoff. Status queries native `queue list --all --all-rigs --full --json` and filters by job tags; no local copy of queue state. Decision content remains durable even if delivery fails. Native queue persistence is authoritative; wrapper failure reports delivery/persistence uncertainty honestly.

### C6 Optional fleet

`Fleet` is `{version:1,name:string,jobIds:string[],manager:{rigId:string,nodeId:string,address:string}|null,coordinating:boolean,instance?:{id:string,rigName:string,rigId:string|null,workspace:{path:string,mode:"existing",owned:false},seats:Seat[],specPath:string,launched:boolean}}`. `bin/rig-fleet create NAME`, `up NAME`, `add NAME JOB_ID`, `status NAME`, `take NAME --seat ADDRESS`, `release NAME`, and `handover NAME --source SOURCE` accept --json; up/take/release/handover accept --plan. Up optionally creates a native manager instance in a state-directory home, with a frozen spec and recorded native identity; retries reconcile that same instance rather than replace it. A native assignment qitem gives the manager the fleet name and absolute tool paths. Take selects an existing native seat reference and records coordination after verifying its identity. It does not claim that the caller became its occupant. An env-less assistant may select the seat on the human's behalf; a managed caller must actually be that seat. Attachment to unbound seats uses native `rig attach --self`; occupant replacement uses native `rig seat handover`, with its results reported independently. Release only sets coordinating=false, preserving manager identity, queues, session, and jobs. No native detach/stop is implied. External CLI seats can poll queues; installed external_cli bindings lack inbound tmux transport, so automatic pane nudges require a managed pane. Native bindings own identity and handover; no leases, tokens, separate authentication, or heartbeat daemon. Fleet-seat lifecycle authority requires separately saved `FLEET_MAY_SPAWN=1`; ordinary shells are allowed and other job seats cannot spawn sibling jobs.

### C7 Dependencies

`Dependency` is `{jobId:string,policy:"human-merge"|"workspace-handoff",state:"waiting"|"ready"|"blocked",commit:string|null,handoffAcceptedAt?:string}`. Dependencies must be in the same repository, cannot cycle, and cannot refer to abandoned jobs. `merged ID --commit REV` records a human-directed integration revision only after ancestor checks against the recorded source branch/revision and configured integration branch. `--attest` explicitly records a human-authorized squash/rebase mapping. Separate-workspace implementation requires the dependent HEAD to contain that commit; no automatic fetch/merge/rebase/cherry-pick. Investigation may run while waiting, with the restriction in the lead brief. `dependency-check ID` updates readiness. Same-workspace sequential jobs require the predecessor retired and verified plus a matching retained handoff at acceptance, including reuse of a formerly managed checkout as an existing workspace. Once accepted, the recorded baseline permits the dependent job to edit that content; changes before acceptance remain blocked. `handoff ID --file PATH` stores `{head:string,files:[{path:string,kind:"file"|"symlink"|"absent",digest:string|null}]}` using SHA-256 digests and reviewer/tester evidence; paths cannot escape the checkout. No automatic commits or merges. Only one rig reserves that workspace at a time.

## Context

- `lib/runtime-config.mjs:85` provides atomic writes; `lib/runtime-launch.mjs:18` loads the installed schema.
- `bin/rig-job-legacy` contains the preserved legacy start sequence; preserve it as the explicit legacy path.
- `tests/fixture.mjs:11` builds isolated CLI/package fixtures.

## Behavior

Release changes assignment only; no session or job stop; handover delegates upstream.

## Implementation

Implement aggregate jobs and select an optional native coordination seat. in `lib/job-fleet.mjs, bin/rig-fleet, agents/fleet/manager`. Consume E1, E3, E4; C6; produce Fleet membership and native manager reference. Native operations and contract shapes above are binding.

## Tests

Tests prove take identity, release without lifecycle effects, native handover failure, and offline status.

## Done when

- The element-specific cases above pass in `node --test tests/job-rigs.test.mjs`.
- Existing runtime and legacy lifecycle tests continue to pass.
- Added function bodies contain no explanatory prose comments.

## Contract issues

none
