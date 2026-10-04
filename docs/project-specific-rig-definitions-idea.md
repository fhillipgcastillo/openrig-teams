# Idea: project-specific rig definitions

Recorded: 2026-10-04

Status: idea only. No planning or implementation requested yet.

Each project should have its own rig definitions, including its teams, seats,
AI models, and other rig settings. These choices should belong to that project
rather than being general settings shared across projects.

For example, job-radar should be able to define which seats it uses, the runtime
and model for each seat, and the rest of its rig configuration independently
of other projects. Changing job-radar's choices should not change another
project's rigs or the shared team templates.

The exact storage location and configuration format are undecided. This note
captures the desired project-specific ownership, not a proposed design or plan.
