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

## Questions for the future integration

- Which knowledge should be shared within a pod, project, or across projects?
- How will seats publish learning and retrieve relevant prior knowledge?
- How will source attribution, review, corrections, and stale knowledge work?
- Which interface will the separately developed memory system expose?
- Which native OpenRig context facilities should connect to that interface?

These questions are intentionally undecided until the external system's
contracts and the desired integration scope are available.

Related design: [independent job rigs and optional fleet management](blueprints/2026-10-09-independent-job-rigs.md).
