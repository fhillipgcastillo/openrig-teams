# Spec-driven execution workflows

Status: agreed workflow definitions; native workflow configuration and role
changes are not implemented by this document.

## Entry and shared rules

Both workflows begin when the rig receives the assigned task or tasks. The
assignment identifies the requested outcome and any supplied Blueprint and
element specs. The lead locates those documents and assigns their execution.

Use the document paths supplied in the assignment. Resolve relative paths from
the assigned workspace. The usual layout is `docs/blueprints/<name>.md` with
element specs in `docs/blueprints/<name>/E<n>-<element-name>.md`. If a supplied
path is missing or the intended documents are ambiguous, request clarification
before executing the affected work.

Written specs replace the rig's planning stage. The lead reads the assignment,
confirms the required inputs are available, and assigns execution. Missing
requirements or conflicting contracts return to the user for clarification;
seats do not silently rewrite the agreed behavior.

Both workflows support an existing checkout or a managed worktree through the
existing job options. Workspace choice is independent of workflow choice.

## Roles

| Seat | Responsibility |
| --- | --- |
| Lead | Assign work, coordinate dependencies, route blockers, and assemble the completion report. |
| Tester | Write behavioral acceptance/regression tests, demonstrate RED, independently verify implementation, and report results. |
| Builder | Implement the assigned behavior, add implementation tests where useful, and fix implementation findings. |
| Reviewer | Review implementation quality, test validity, and whether the result satisfies the assignment. |

The tester initially owns both test authoring and verification. A dedicated RED
test writer is an optional topology variation. Larger features may use additional
builders when assignments can safely run in parallel.

## Behavioral testing rules

- Derive acceptance tests from the task/spec and public contracts. Assert
  observable inputs, outputs, errors, state changes, or user interactions rather
  than incidental helper calls or internal structure.
- Run the relevant baseline checks. Demonstrate that each new RED test fails
  because the requested behavior is missing or incorrect. An unrelated fixture,
  dependency, or environment failure does not satisfy RED.
- Keep the cycle small: test one coherent behavior or slice, implement it, verify
  it, then repeat as needed.
- The builder must not modify tester-owned acceptance tests. It may add and
  maintain its own implementation tests without weakening acceptance coverage.
- The tester may correct a faulty test with reviewer scrutiny. Record the reason
  against the requirement and renew RED evidence where applicable. A test must
  not be weakened merely to accept the implementation.
- Preserve the refactoring step within the assigned scope; rerun affected checks
  after changes.
- For tasks without testable behavioral changes, the lead names the appropriate
  verification step and the tester reports its result. Do not invent artificial
  RED tests.

These are role and progression rules; this document does not introduce technical
write restrictions on test files.

## Workflow 1: Small task

Use for one bounded fix or change with a clear expected outcome. Input is a task
brief or written spec with expected behavior; a full Blueprint is optional.

```text
Read assignment → RED → Implement → Verify → Review → Report
```

| Stage | Owner | Required result to advance |
| --- | --- | --- |
| Read assignment | Lead | Clear scope, expected behavior, and an executable assignment. |
| RED | Tester | Behavioral tests fail for the expected reason, or an appropriate alternative verification is identified. |
| Implement | Builder | Requested behavior implemented and relevant local checks run. |
| Verify | Tester | Acceptance tests and relevant existing checks pass; unchecked items are explicit. |
| Review | Reviewer | Implementation and tests satisfy the assignment; blocking findings are resolved. |
| Report | Lead | Delivered behavior, commands/results, and remaining limitations are reported. |

Implementation starts after meaningful RED or the stated alternative verification
path. Completion requires passing verification and review for the delivered
result.

## Workflow 2: Blueprint feature

Use for interacting elements with shared contracts and dependencies. Inputs are
the reviewed Blueprint and written specs for every element in the assigned scope.

```text
Read Blueprint/specs → Assign wave → [RED → Implement → Verify → Review]
                            ↑                         │
                            └──── Next ready wave ────┘
                                      │
                               All assigned waves pass
                                      ↓
                         Integration verification → Report
```

| Stage | Owner | Required result to advance |
| --- | --- | --- |
| Read Blueprint/specs | Lead | Assigned elements have specs and no unresolved contract issues. |
| Assign wave | Lead | Element assignments follow the Blueprint build order and have safe editing boundaries. |
| Execute elements | Tester, builder, reviewer | Each element completes the small-task RED/implementation/verification/review cycle and its spec's completion checks. |
| Advance wave | Lead | Every element in the current wave passes its required checks before the next wave starts. |
| Integration verification | Tester and reviewer | Combined behavior and shared contracts satisfy the assigned acceptance criteria; blocking findings are resolved. |
| Report | Lead | Status per element, integrated behavior, commands/results, and remaining limitations are reported. |

Elements in the same wave may run in parallel only when their editing and test
resources can safely coexist. The lead serializes conflicting assignments.
Workers implement their element specs; they do not produce replacement plans.

## Repair loops and waiting

| Finding | Next owner and transition |
| --- | --- |
| Implementation fails verification | Builder repairs → tester verifies → reviewer reviews. |
| Reviewer finds an implementation problem | Builder repairs → affected verification reruns → reviewer reviews. |
| Test is incorrect or coverage is missing | Tester corrects/adds tests → reviewer checks test validity → renew RED where applicable → builder implements → verify and review. |
| Requirement or shared contract is unclear | Lead requests human clarification → affected work waits → resume from the affected stage after resolution. |
| Environment or permission blocks a required check | Lead reports the blocker → affected work waits; do not claim completion. |
| Integration check fails | Lead routes the finding to the responsible element owner → repair and affected checks rerun → integration verification repeats. |

The lead records each repair finding and next owner. Repeated repairs without
progress stop for escalation rather than continuing indefinitely. No workflow
silently expands scope or changes the required behavior to make checks pass.

Completion reports do not authorize commits, publication, service operations, or
workspace cleanup. Existing project and job boundaries continue to apply.
