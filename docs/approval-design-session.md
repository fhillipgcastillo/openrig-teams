# Separate session: approval design for openrig-teams

Work in `~/repos/openrig-teams`. This session is for discussing the reusable
OpenRig team setup, not implementing features in `job-radar`.

## What I want to discuss

I want one human-facing entry point: the lead. FE, BE and DevOps agents should
not repeatedly interrupt me directly for routine permissions. When a team
needs approval, the lead should know about it, judge whether it falls within
the authority I already delegated, and involve me only when my decision is
actually necessary.

Be frank. Challenge weak assumptions and distinguish what the tools enforce
from what an instruction merely asks an agent to do. Do not agree just to be
helpful. This is a discussion first; do not implement the resulting design,
restart agents, change permission scope, or enable full bypass without my
explicit instruction.

## Context from the job-radar onboarding session

- OpenRig was installed as `@openrig/cli@0.6.4` under Node 24.21.0. Codex CLI
  was 0.160.0, authenticated through ChatGPT; tmux was 3.6. Recheck versions.
- I explicitly chose Codex CLI for every seat. Do not install Claude Code.
- This repo originally had Claude-only templates. The onboarding session
  changed the five rig templates and nine AgentSpecs to Codex, selected only
  `shared:codex-default-config`, updated role instruction references, and added
  Codex artifact exclusions. These edits were left uncommitted.
- The lead is `control-lead@lead`, using `rigs/lead/rig.yaml` and working in
  `homes/lead`. It was launched successfully, with a passing health and live
  topology check. There were no FE/BE/DevOps job teams. Verify live state.
- The lead's startup ran into a native Codex approval prompt for
  `rig whoami --json` because the sandbox could not reach the local daemon.
  I approved it in the terminal, selecting a remembered `rig whoami` allowance.
  It then verified its identity and awaited an assignment.
- I have seen a related problem on another computer/OS: every fresh team
  required me to visit its seats individually to approve basic instruction
  reads and discovery of rig details. This is my report, not a reproduction
  from this machine. Investigate the exact command and native denial before
  claiming it has the same cause.
- I approved adding native Codex auto-review to this setup. The reusable
  template is `profiles/openrig-auto.config.toml`. `bin/setup` installs it
  under `${CODEX_HOME:-$HOME/.codex}/openrig-auto.config.toml`, preserving an
  existing matching profile and refusing to overwrite a differing one.
  Every rig member selects it with `codex_config_profile: openrig-auto`.
  The values are `sandbox_mode = "workspace-write"`,
  `approval_policy = "on-request"`, and `approvals_reviewer = "auto_review"`.
  This configures future launches; the existing lead was not restarted to
  activate it. Check the actual effective native configuration.
- Auto-review uses Codex's separate reviewer; it is not the OpenRig lead.
  The configuration does not grant the lead new approval authority, select
  YOLO/full bypass, or guarantee that every boot operation will be permitted.
- `LEAD_MAY_SPAWN=0` is still configured in
  `~/.config/openrig-teams/config.env`. Enabling native approvals does not
  automatically authorize the lead to start new jobs.
- A machine-local `job-radar` profile exists under
  `~/.config/openrig-teams/projects/job-radar.sh`: main branch, FE/BE defaults,
  worktrees in `~/repos/job-radar-worktrees/<job>`, offline pnpm installation
  with scripts disabled, copies existing environment files, and seeds each
  worktree's `AGENTS.md` from tracked `CLAUDE.md`. That project currently lacks
  environment files and isolated-stack tooling. Keep those project concerns
  out of this approval-design discussion unless necessary as an example.

## Questions to examine

1. Is the lead acting as permission judge a sound design? Where would it add
   value, and where would it become a bottleneck or undermine independent
   checks? Compare a lead making workflow decisions with a native reviewer
   enforcing execution boundaries. Include the risk of a lead approving work
   it originated and of untrusted tool output influencing that decision.
2. What can current OpenRig and Codex actually support: observing a seat's
   pending native approval, routing it to a lead, recording the decision,
   and resuming that exact action? Which parts would require new tooling?
   Do not treat typing Yes into another seat's terminal as a sound permission
   broker without addressing identity, exact-command binding, scope and audit.
3. What should work automatically before an agent starts reasoning: its own
   instruction/skill reads, identity, topology discovery and local coordination?
   Which exact verbs, paths and network endpoints are needed? Avoid treating
   an allowance for the whole `rig` family as a read-only permission: it can
   start/stop agents, change configuration and launch processes.
4. Can we combine deterministic narrow boot permissions, native auto-review
   for ordinary requests, and lead-mediated escalation to me for exceptions?
   Do not assume this is the answer; compare alternatives honestly.
5. What decisions belong exclusively to me, and what can I delegate in advance?
   Distinguish command-execution capability from authority to undertake work,
   spend resources, change infrastructure, publish, or affect another project.
6. What happens if the lead is unavailable, the reviewer rejects an action,
   a request loops, or multiple teams request approval simultaneously?
   Define clear stop/escalation behavior, without silently enabling bypass.
7. How would this stay portable across Linux/WSL, Windows and macOS, fresh
   worktrees, new seats, resumes and upgrades? Verify native support per OS.

## Sources and constraints

Read this repo's `AGENTS.md`, `README.md`, `docs/codex-setup.md`, `bin/setup`,
`bin/rig-home`, `bin/rig-team`, `bin/rig-job`, role guidance and culture rules.
Inspect the current uncommitted diff before touching anything. Preserve it.
Read the relevant lessons in the user's shared instructions.

Use the `openrig-skills` router and the installed permission-policy guidance.
The installed OpenRig docs live under the global `@openrig/cli/daemon/docs/`
directory. Recheck paths instead of assuming the Node installation location.
Use official OpenAI documentation for Codex permissions and auto-review:

- https://learn.chatgpt.com/docs/sandboxing/auto-review
- https://learn.chatgpt.com/docs/agent-approvals-security
- https://learn.chatgpt.com/docs/agent-configuration/rules

The repo currently says not to answer another seat's permission prompts and
to keep the human's services untouched. A proposed lead-broker design would
need an explicit, scoped change to that rule, not an implicit workaround.

Start with your candid assessment and the essential distinctions. Then discuss
the unresolved decisions with me. If we settle on a design, write a concrete
acceptance checklist that includes a fresh-seat test where basic orientation
works without visiting each terminal. Use the user's planning workflow only
when we actually authorize implementation. Do not commit or push.
