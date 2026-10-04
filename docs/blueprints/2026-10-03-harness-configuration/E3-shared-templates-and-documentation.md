# Spec: E3 `shared templates and documentation`

## Goal anchor
Keep one reusable set of OpenRig team templates supporting Claude Code, Codex, and mixed teams, with explicit machine-local runtime and approval preferences and project-specific onboarding kept outside shared defaults.

- AC2 Lead, PM, and department launches resolve the same configuration, including per-seat overrides; both harnesses retain their runtime resources.
- AC3 Codex auto-review is optional. Claude native/auto selection uses supported OpenRig operations and accurately reports the first-launch limitation; no implicit restarts or bypass.
- AC4 Documentation and instruction loading support both harnesses; exclusions protect the files the selected runtimes actually write.
- AC5 Tests use temporary configurations and mocked lifecycle commands; the user's staged README edit, running rigs, project profiles, and approval-design-session.md are preserved.

## Contract
Interface: Template members use `runtime: codex` only as a renderable baseline, with no mandatory Codex profile; `managed_blocks.claude-code: CLAUDE.local.md` restored; all four original runtime resources restored and filtered by OpenRig's runtime projection.

- C1 Configuration: `${OPENRIG_TEAMS_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/openrig-teams}/runtime.json`, JSON object `{ "version": 1, "runtime": "codex" | "claude-code", "approvals": { "codex": "native" | "auto", "claude-code": "native" | "auto" }, "seats": { "<team>.<member>": { "runtime"?: "codex" | "claude-code", "approval"?: "native" | "auto" } } }`. Valid seats: `lead.lead`, `pm.pm`, `fe.builder`, `fe.reviewer`, `fe.tester`, `be.builder`, `be.reviewer`, `be.tester`, `devops.operator`. Missing/invalid configuration fails actionable at plan/up; lifecycle down/remove/name remains available. Native means ordinary OpenRig launch behavior plus native user/managed rules; applying Claude native records `floor`, not `inherit`, and does not clear native permission rules.
- C2 Library `lib/runtime-config.mjs` exports `configDir(env = process.env): string`, `loadSettings(env = process.env): C1`, `resolveSeat(settings, team, member): { runtime, approval }`, `findOpenRigPackage(env = process.env): string`, and `validateSettings(settings): C1`. Unknown fields/seat names and invalid values fail. OpenRig package discovery follows `rig` on PATH to its real path and locates `daemon/specs/agents/shared` without daemon access.
- C3 Setup CLI: `bin/setup [--runtime codex|claude-code] [--codex-approvals native|auto] [--claude-approvals native|auto] [--seat <team>.<member>=codex|claude-code] [--seat-approval <team>.<member>=native|auto] [--plan]`. First setup asks on a TTY for omitted relevant choices; noninteractive initial setup requires runtime and approval choices for every selected runtime. Unselected harnesses initially store `native`; an existing stored choice is retained when later selecting that harness. Existing settings are retained except explicit overrides. Exit 0 success, 1 invalid input/config/dependencies. Plan writes nothing. Only selected Codex auto installs the existing `openrig-auto.config.toml`, preserving identical files and refusing differing files. Setup checks selected CLIs are available and reports their auth checks to the user; it never installs a CLI, logs in, launches rigs, or edits global permission allowlists. Existing `config.env` and project profiles are preserved.
- C4 Runtime helper CLI: `bin/rig-runtime render <team> <rig-name> <output-path>` writes a generated spec using C1/C2 and OpenRig's installed YAML parser; `bin/rig-runtime permissions <team> <rig-name> [--plan]` shows/applies native permission selections for Claude seats only, verifies actual seat runtime before mutation, and refuses mismatches. `bin/rig-runtime check <team>...` validates settings and selected CLI/profile prerequisites before job mutations and prints exactly `codex`, `claude-code`, or `both` on stdout; diagnostics go to stderr. Codex auto requires an identical installed profile and successful `codex -p openrig-auto mcp list` loader probe (captured output, 10-second timeout). Permission application queries `rig ps --nodes --rig <rig-name> --json`, verifies every expected seat runtime before any mutation, and then sets Claude modes. Exit 0 success, 1 failure. Claude auto maps to `rig seat set-permissions <pod>-<member>@<rig-name> --mode auto --reason <reason>`; native maps to `floor`. Codex auto adds `codex_config_profile: openrig-auto`; native omits it. No bypass modes or broad command allowances are added.
- C5 Wrapper actions: existing `plan|up|down|resume|remove|name` retain meaning; `permissions` explicitly applies saved Claude preferences. Plan generates a separate ignored `.plan.yaml` and prints deferred permission steps without executing them. Up renders, launches, then saves Claude choices with a clear next-launch notice. Resume applies configured Claude choices to verified existing seats before `rig up <name> --existing`; it never changes the stored harness of a seat. Harness and Codex named-profile changes affect newly generated rigs; changing an existing rig's harness requires deliberate recreation outside this feature. Claude approval changes are the explicit supported exception: permissions/resume applies the saved choice to verified same-runtime seats for their next launch. `rig-job` validates selected teams before branch/worktree changes and passes selected runtime information to exclusions.
- C6 Exclusions: `bin/rig-exclude <project> [--runtime codex|claude-code|both]`; default `both` preserves existing calls. Runtime-specific collision checks cover only selected runtimes; exclusion blocks retain previously installed artifact patterns so simultaneous jobs using other runtimes stay hidden. Keep current refusal of tracked generated files. Job launch computes the union of effective runtimes across its selected teams and supplies it. Project instruction bridging remains the project profile's responsibility; never overwrite or copy instruction files generically.

## Context
- `agents/fe/builder/agent.yaml:6` fixes the agent baseline to Codex; `agents/fe/builder/agent.yaml:18` selects only its Codex resource. Equivalent resource declarations appear in all nine AgentSpecs, as confirmed by the scoped resource search.
- `agents/shared/agent.yaml:51` declares four runtime resources and their runtime-specific types: Claude settings, Claude MCP, Codex configuration, and Claude activity hooks. This is an existing setup-created symlink; do not edit its target.
- `rigs/fe/rig.yaml:5` declares the culture file, with no managed-block override; `rigs/fe/rig.yaml:13` and subsequent members pin Codex and its auto-review profile. All five RigSpecs carry the same mandatory profile pattern.
- `culture/CULTURE.md:3` and `agents/fe/builder/guidance/role.md:12` identify only AGENTS.md as project instruction source. FE/BE reviewer and tester guidance have corresponding single-file references.
- `README.md:3` begins the user's staged introductory paragraph; its second sentence is intentionally a single line. The staged diff contains only this line wrapping change and must remain intact.
- `README.md:6`, `README.md:60`, and `README.md:161` describe Codex as universal and auto-review as mandatory. `README.md:131` and `README.md:153` distinguish earlier testing from currently unmeasured behavior.
- `AGENTS.md:9` has a Codex-only precedence section and job-radar-specific instructions; `AGENTS.md:50` separately mandates a broad Claude permission allowlist. Both conflict with the approved configurable setup contract.
- `docs/codex-setup.md:15` mixes an OpenRig version-specific setup caveat with machine-specific tmux state; `docs/codex-setup.md:44` starts machine-local job-radar profile details.
- `docs/project-profile.md:18` discusses copied instruction files only in terms of Claude; `docs/project-profile.md:22` similarly lists only Claude-generated paths.
- `docs/findings.md:1` dates its findings to OpenRig 0.6.3; `docs/findings.md:23` and `docs/findings.md:28` distinguish exercised Claude behavior from source-derived limits. This element preserves that historical document.
- `bin/rig-home:18` currently launches source templates directly; E2 replaces this with rendering. Documentation must describe the completed C5 interface rather than this current implementation.
- `bin/rig-exclude:22` currently combines both harnesses' artifacts. E2 implements runtime-specific selection under C6.

## Behavior
1. Keep nine role definitions and five rig templates. Runtime selection belongs to saved local settings and the E2 renderer, never a second copy of every role. Retain `runtime: codex` as the valid renderable baseline and retain agent defaults unless a schema requirement demands otherwise.
2. Restore every AgentSpec's resource list, exactly:
   ```yaml
   runtime_resources: [shared:claude-default-settings, shared:claude-default-mcp, shared:codex-default-config, shared:claude-activity-hooks]
   ```
   Preserve role skill selections, plugin selection, startup guidance, and imports. OpenRig projects the runtime resources appropriate to the effective seat runtime.
3. Restore this mapping after each rig's culture file and remove every template member's `codex_config_profile`:
   ```yaml
   managed_blocks:
     claude-code: CLAUDE.local.md
   ```
   Keep pod/member IDs, edges, working directories, references, and role assignments intact. Generated Codex-auto members receive their profile through E2.
4. Role guidance and culture refer to the project's applicable AGENTS.md / CLAUDE.md instructions. Do not claim that both CLIs automatically read both names under every condition. Leave role responsibilities and authorization boundaries intact.
5. AGENTS.md becomes the reusable agent onboarding guide for either harness or mixed teams. CLAUDE.md contains exactly `@AGENTS.md` plus a trailing newline so Claude imports this shared guide. Explain that the repository bridge is deliberate; project bridges require project-specific decisions.
6. Setup documentation describes runtime selection, native/auto approval selection, per-seat overrides, saved defaults, plan-only behavior, and configuration directory overrides exactly as C1–C3 define. Include the valid seat keys, or link to a complete table in docs/setup.md.
7. Explain native behavior as ordinary OpenRig launch behavior constrained by native and managed configuration. Claude `native` maps to `floor`; it does not guarantee a prompt on every operation. Codex auto installs the optional profile only when selected for an effective seat and preserves/refuses existing files per C3.
8. Describe Claude auto's lifecycle accurately: initial `up` launches before the preference can be saved; preference saving applies to a subsequent launch. `resume` applies it to existing seats of the expected runtime before launch. The `permissions` action explicitly saves choices. There is no automatic restart or conversion of stored seat runtimes. Native runtime/account restrictions may reject auto; no fallback to bypass is promised.
9. Keep project configuration outside shared defaults: remove job-radar paths, dependency commands, machine tmux state, and project-specific runtime prescriptions. docs/project-profile.md explains how a profile preserves instruction content according to the chosen runtimes, while generated-file collisions still stop launches. Never recommend generic overwriting/copying of tracked instructions.
10. Document C6 artifacts by runtime, with `.openrig/` common to both. Describe default `both`, selected runtime unions during jobs, local shared git exclusion behavior, and refusal of tracked generated files. Do not imply gitignore can protect a tracked file from writes.
11. Preserve the staged README first paragraph byte-for-byte, the index, historical findings, all machine-local profiles, running rigs, and docs/approval-design-session.md. Do not open or edit the approval design file. Existing links to it may remain.
12. Update all changed command tables and examples to actual C3–C6 flags. State that wrappers are required to apply local settings and that direct launches of tracked rig templates use baseline values.

## Implementation
1. Inspect the working tree and staged README diff; retain the current README opening through its first paragraph without reflowing. Do not stage changes.
2. Update only nine `agents/*/*/agent.yaml` resource lists and five `rigs/*/rig.yaml` managed-block/profile sections as above.
3. Update the project instruction references in FE/BE builder, reviewer, tester guidance and culture. Inspect remaining role guidance for harness-specific assumptions; edit only relevant statements.
4. Write `docs/setup.md` as the primary onboarding guide. Include prerequisites for only selected CLIs, human-run authentication verification, backup guidance for selected harness configuration, `bin/setup --plan`, saved configuration, and initial lead plan/up checks. Setup itself does not authenticate, install CLIs, launch rigs, or modify global permissions.
5. Include concrete setup examples: Codex native (`bin/setup --runtime codex --codex-approvals native`), Claude native (`bin/setup --runtime claude-code --claude-approvals native`), Codex auto, Claude auto, and a mixed example with `--seat fe.reviewer=claude-code --claude-approvals native`. Show `--seat-approval` independently and explain its resolution against the effective runtime.
6. Include a compact C1 JSON example with version, both runtime approval defaults, and a seat override; state unspecified settings persist on repeated setup. Document missing/invalid runtime configuration failures at plan/up and lifecycle cleanup availability.
7. Replace AGENTS.md's competing machine setup sections with runtime-neutral ordered steps linking docs/setup.md. Preserve project/job workflow and explicit human ownership of commits, existing services, worktree removal, and spawn authorization. Remove mandatory broad allowlist edits.
8. Create the one-line CLAUDE.md import. Document instruction collision concerns without promising universal cross-CLI filename discovery. If mentioning current native Claude AGENTS.md discovery behavior, verify against official current Claude documentation and cite the precise source; the explicit import is sufficient without that claim.
9. Update README after its staged opening: dual-harness scope, new guide link, runtime.json layout, wrapper `permissions` action, plan generation, approval choices, and mixed teams. Keep historical memory figures labeled as prior Claude measurements and avoid claiming fresh live validation.
10. Reduce docs/codex-setup.md to the Codex-specific supplement linking generic setup: auth/config backup, optional auto-review profile semantics, restrictions, and version-scoped bare `rig setup` caveat if retained. No job-radar defaults.
11. Extend docs/project-profile.md for both runtimes, instruction bridges, selected-runtime collision checking, and unchanged hook/config responsibilities.
12. Review the diff and validate YAML using the installed OpenRig schema/parser discovered from `rig` on PATH. Do not install packages or launch any real rig for validation.

## Tests
- Every AgentSpec parsed as YAML → contains exactly the four resource names above and validates through installed AgentSpec schema.
- Every RigSpec parsed as YAML → all members keep Codex baseline, none has mandatory `codex_config_profile`, `managed_blocks.claude-code` equals `CLAUDE.local.md`, and installed RigSpecSchema validation succeeds.
- `CLAUDE.md` bytes → `@AGENTS.md\n`.
- `git diff --cached -- README.md` after work → identical to its initial staged diff; working README's initial paragraph remains identical.
- Targeted text review of shared guidance and setup docs → no requirement for all seats to use Codex, no mandatory auto-review, no shared job-radar configuration, no claim of first-launch Claude auto.
- Setup examples checked against C3 and final E1 help; lifecycle examples checked against C4–C6 and final E2 help → only supported flags and documented seat keys.
- `git diff -- docs/findings.md` → empty; `git diff --name-only` → does not include docs/approval-design-session.md. Do not read that file for verification.

## Done when
- All nine AgentSpecs and five RigSpecs pass installed schema validation without daemon or real-seat operations.
- Both harnesses' resources and Claude managed-block routing exist in the shared templates, with approval injection left to runtime generation.
- Cross-harness onboarding and approval timing match C1–C6, examples are actionable, and project-specific policy is absent from shared defaults.
- README staged contents, historical findings, and excluded approval design remain untouched.
- Report schema checks and documentation review honestly; no live Claude/Codex launch verification is claimed.

## Contract issues
None.
