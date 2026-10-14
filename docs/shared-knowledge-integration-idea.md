# Future idea: shared knowledge and continuous learning

Recorded: 2026-10-10

Status: future integration idea only; outside the current independent-job-rig implementation.

## Intent

Allow knowledge learned by a team, pod, or seat to become available to other
relevant teams, pods, and seats, including across separate job rigs. Useful
learning should survive the session or job that produced it.

The user is separately building a shareable continuous-learning and memory
system and intends to integrate it with this workflow later. This project
should integrate with that system rather than preemptively build a competing
memory implementation.

## Scope boundary

The current round implements job coordination and its durable operational
records. Briefs, verification evidence, attention requests, and handoffs are
operational records; they do not constitute the future shared-learning system.

This idea adds no current acceptance criterion, implementation element, memory
service, storage format, retrieval API, synchronization process, or automatic
learning behavior. Current job operation must not depend on the future system.

## Existing global hook interaction

The [2026-10-14 investigation report](https://github.com/fhillipgcastillo/agentic-memory/blob/main/docs/learning/2026-10-14-hook-isolation-and-session-end-issues.md) in agentic-memory records the user's report of journal/Learning activity triggering the lead and completion timeouts. A synthetic check reproduced AI Hub's legacy journal writer preserving OpenRig identity variables and an inherited Anthropic API key. The exact lead activation chain and OAuth/timeout cause remain unverified. See also [the global hook inheritance finding](findings.md#files-openrig-writes-into-a-seats-folder).

AI Hub owns the implicated launchers; this repository is the affected integration context. This reference does not add a Learning implementation dependency to job rigs. The report is available locally at `docs/learning/2026-10-14-hook-isolation-and-session-end-issues.md` in the separate agentic-memory checkout; the repository link becomes available after the report is pushed.

## Questions for the future integration

- Which knowledge should be shared within a pod, project, or across projects?
- How will seats publish learning and retrieve relevant prior knowledge?
- How will source attribution, review, corrections, and stale knowledge work?
- Which interface will the separately developed memory system expose?
- Which native OpenRig context facilities should connect to that interface?

These questions are intentionally undecided until the external system's
contracts and the desired integration scope are available.

Related design: [independent job rigs and optional fleet management](blueprints/2026-10-09-independent-job-rigs.md).
