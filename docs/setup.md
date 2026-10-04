# Setup: Claude Code, Codex, or mixed teams

One set of roles supports both coding CLIs. `bin/setup` saves machine-local
runtime and approval preferences; the launch wrappers render them into generated
rigs. The tracked templates use Codex as a baseline, so launch through
`bin/rig-home`, `bin/rig-team`, or `bin/rig-job` to apply your preferences.

## Prerequisites and first setup

This integration targets OpenRig 0.6.4. Install OpenRig separately if needed
(`npm install -g @openrig/cli@0.6.4`), then check `rig --version`,
`node --version` (22 or 24), and `tmux -V`. Install and authenticate only the
coding CLIs you select: `codex`, `claude`, or both. For Codex, verify
`codex login status`; for Claude, verify authentication through its native CLI.
Setup checks executable availability and reports authentication checks; it does
not install CLIs, log in, or launch rigs.

Before a first launch, back up the selected harness's user configuration:
`${CODEX_HOME:-$HOME/.codex}/config.toml` for Codex; `~/.claude.json` and
`~/.claude/settings.json` for Claude. OpenRig launch configures runtime resources
and workspace integration. Review native and managed rules for your environment.

OpenRig 0.6.4's bare `rig setup` attempts to install Claude Code. This repository's
`bin/setup` provides its own setup path for either harness; bare `rig setup` is
not required here.

Run `bin/setup --plan` in a terminal to choose a default runtime and the approval
mode for each selected runtime. Inspect the plan, then run `bin/setup` with the
same choices. A plan writes nothing, so choices made in a plan are not saved.
For scripts, provide those choices explicitly:

```sh
bin/setup --runtime codex --codex-approvals native --plan
bin/setup --runtime codex --codex-approvals native
```

Other initial configurations:

```sh
bin/setup --runtime claude-code --claude-approvals native
bin/setup --runtime codex --codex-approvals auto
bin/setup --runtime claude-code --claude-approvals auto
bin/setup --runtime codex --codex-approvals auto --seat fe.reviewer=claude-code --claude-approvals native
```

Noninteractive first setup requires a runtime and approval choice for every
selected runtime. Unselected runtimes initially store `native`. Repeat setup
retains saved choices except explicitly supplied overrides, so a later switch
reuses the stored approval choice for that runtime. It preserves `config.env`
and project profiles. Rerun after cloning, upgrading OpenRig, or switching Node
versions to refresh machine-specific links.

## Saved preferences and seat overrides

Settings live at
`${OPENRIG_TEAMS_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/openrig-teams}/runtime.json`.
The separate `config.env` controls lead job spawning; `projects/*.sh` contain
project onboarding. Runtime settings do not grant spawning permission.

```json
{
  "version": 1,
  "runtime": "codex",
  "approvals": { "codex": "auto", "claude-code": "native" },
  "seats": { "fe.reviewer": { "runtime": "claude-code", "approval": "native" } }
}
```

A seat uses its runtime override or the default runtime, then its approval
override or that runtime's approval default. Valid seat keys are:

| Team | Keys |
|---|---|
| Lead | `lead.lead` |
| PM | `pm.pm` |
| FE | `fe.builder`, `fe.reviewer`, `fe.tester` |
| BE | `be.builder`, `be.reviewer`, `be.tester` |
| DevOps | `devops.operator` |

For example, `bin/setup --seat-approval fe.builder=native` changes only that
seat's approval selection. `--seat` and `--seat-approval` can each be repeated.
Unknown keys, unknown seats, and invalid values fail validation. Missing or
invalid settings stop plan/up with a setup instruction; down/remove/name remain
available for lifecycle cleanup.

## Approval modes and existing seats

| Runtime | `native` | `auto` |
|---|---|---|
| Codex | Ordinary OpenRig launch and native/managed configuration; no named profile added | Adds the optional `openrig-auto` profile using workspace-write sandboxing and Codex's approval reviewer |
| Claude Code | Records OpenRig `floor`, retaining native permission rules | Records OpenRig `auto` using its supported seat permission command |

Claude `native` explicitly records `floor`, not `inherit`. Neither native mode
promises a prompt on every operation. Auto eligibility and restrictions depend
on the installed CLI, account, and managed configuration; failures are reported
without a bypass fallback. No broad command allowlist is added, and the lead
cannot approve other seats' prompts.

Claude seats must exist before OpenRig can save their permission selection.
Initial `up` launches the rig, then saves the choice **for the next launch**.
It does not restart seats. `permissions` explicitly saves preferences on verified
existing Claude seats. `resume` applies the saved preferences before relaunching:

```sh
bin/rig-home lead permissions
bin/rig-home lead resume
bin/rig-team fe <worktree> permissions
```

These commands verify that existing seats use the configured runtime before
changing permissions. `plan` prints deferred permission operations without
applying them. Harness and Codex named-profile changes affect newly generated
rigs; resuming an existing rig keeps its stored runtime and Codex profile.
Changing those requires deliberate recreation. Claude approval changes are
supported on existing same-runtime seats through `permissions` / `resume`.

When an effective Codex seat selects auto, setup installs
`${CODEX_HOME:-$HOME/.codex}/openrig-auto.config.toml`. It preserves an identical
file and refuses a differing file. Launch preflight checks this file and probes
whether the installed Codex can load the profile. See [Codex details](codex-setup.md).

## Preview and launch

```sh
bin/rig-home lead plan
bin/rig-home lead up
rig ps --nodes --rig lead
```

Inspect the selected runtime and pending permission actions in the plan. Check
live seat state after launch; a startup prompt can still require human input.
Do not stop an existing rig occupying the name without its owner's approval.
Plans use separate ignored `.plan.yaml` files. Department jobs follow the
[README workflow](../README.md#daily-workflow) and [project profile contract](project-profile.md).

## Project instructions and generated files

Roles follow the project's instructions for their selected harness. This
repository shares its setup guide through `CLAUDE.md` importing `@AGENTS.md`.
Project onboarding must decide its own instruction bridge and preserve project
content; the wrappers never generically copy or overwrite instruction files.

| Runtime | Generated paths protected by exclusions |
|---|---|
| Both | `.openrig/` |
| Codex | `AGENTS.md`, `.agents/skills/<role-skill>/`, `.codex/plugins/shared:openrig-core/` |
| Claude Code | `CLAUDE.local.md`, `.mcp.json`, `.claude/settings.local.json`, `.claude/skills/<role-skill>/`, `.claude/plugins/shared:openrig-core/` |

`bin/rig-exclude <project> --runtime codex|claude-code|both` updates a marked
block in shared `.git/info/exclude` for every worktree, without changing
`.gitignore`. With no runtime flag it selects `both`. `rig-job` supplies the
union of effective runtimes in its selected teams. Only selected artifacts are
checked; existing artifact exclusions are retained when later jobs use another
runtime. A tracked generated path causes refusal before exclusion changes;
resolve the collision deliberately before launch. An ignore rule does not
protect tracked files from modification.
