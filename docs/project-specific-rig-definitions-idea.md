# Idea: project-specific rig definitions

Recorded: 2026-10-04

Status: implemented for complete job rigs on 2026-10-10. See [project configuration](project-profile.md) and the [independent-job blueprint](blueprints/2026-10-09-independent-job-rigs.md). Legacy department rigs retain their existing machine settings.

Each project should have its own rig definitions, including its teams, seats,
AI models, and other rig settings. These choices should belong to that project
rather than being general settings shared across projects.

For example, job-radar should be able to define which seats it uses, the runtime
and model for each seat, and the rest of its rig configuration independently
of other projects. Changing job-radar's choices should not change another
project's rigs or the shared team templates.

Project `.openrig-teams/project.json` now selects a complete native template and per-seat runtime/model/approval overrides. Topology belongs in that template, with a job lead and independent review/test seats. Resolved instances retain their choices; changing one project does not rewrite another project or the shared templates. Native runtime/model support and permission limits remain in effect.
