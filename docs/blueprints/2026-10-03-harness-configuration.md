# Blueprint: configurable coding harnesses

## Goal
Keep one reusable set of OpenRig team templates supporting Claude Code, Codex, and mixed teams, with explicit machine-local runtime and approval preferences and project-specific onboarding kept outside shared defaults.

## Acceptance criteria
- AC1 Setup prompts for the initial runtime and approval choices, accepts equivalent flags, persists them locally, and reuses them without rewriting tracked templates.
- AC2 Lead, PM, and department launches resolve the same configuration, including per-seat overrides; both harnesses retain their runtime resources.
- AC3 Codex auto-review is optional. Claude native/auto selection uses supported OpenRig operations and accurately reports the first-launch limitation; no implicit restarts or bypass.
- AC4 Documentation and instruction loading support both harnesses; exclusions protect the files the selected runtimes actually write.
- AC5 Tests use temporary configurations and mocked lifecycle commands; the user's staged README edit, running rigs, project profiles, and approval-design-session.md are preserved.

## Shared contracts
- C1 Configuration: `${OPENRIG_TEAMS_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/openrig-teams}/runtime.json`, JSON object `{ "version": 1, "runtime": "codex" | "claude-code", "approvals": { "codex": "native" | "auto", "claude-code": "native" | "auto" }, "seats": { "<team>.<member>": { "runtime"?: "codex" | "claude-code", "approval"?: "native" | "auto" } } }`. Valid seats: `lead.lead`, `pm.pm`, `fe.builder`, `fe.reviewer`, `fe.tester`, `be.builder`, `be.reviewer`, `be.tester`, `devops.operator`. Missing/invalid configuration fails actionable at plan/up; lifecycle down/remove/name remains available. Native means ordinary OpenRig launch behavior plus native user/managed rules; applying Claude native records `floor`, not `inherit`, and does not clear native permission rules.
- C2 Library `lib/runtime-config.mjs` exports `configDir(env = process.env): string`, `loadSettings(env = process.env): C1`, `resolveSeat(settings, team, member): { runtime, approval }`, `findOpenRigPackage(env = process.env): string`, and `validateSettings(settings): C1`. Unknown fields/seat names and invalid values fail. OpenRig package discovery follows `rig` on PATH to its real path and locates `daemon/specs/agents/shared` without daemon access.
- C3 Setup CLI: `bin/setup [--runtime codex|claude-code] [--codex-approvals native|auto] [--claude-approvals native|auto] [--seat <team>.<member>=codex|claude-code] [--seat-approval <team>.<member>=native|auto] [--plan]`. First setup asks on a TTY for omitted relevant choices; noninteractive initial setup requires runtime and approval choices for every selected runtime. Unselected harnesses initially store `native`; an existing stored choice is retained when later selecting that harness. Existing settings are retained except explicit overrides. Exit 0 success, 1 invalid input/config/dependencies. Plan writes nothing. Only selected Codex auto installs the existing `openrig-auto.config.toml`, preserving identical files and refusing differing files. Setup checks selected CLIs are available and reports their auth checks to the user; it never installs a CLI, logs in, launches rigs, or edits global permission allowlists. Existing `config.env` and project profiles are preserved.
- C4 Runtime helper CLI: `bin/rig-runtime render <team> <rig-name> <output-path>` writes a generated spec using C1/C2 and OpenRig's installed YAML parser; `bin/rig-runtime permissions <team> <rig-name> [--plan]` shows/applies native permission selections for Claude seats only, verifies actual seat runtime before mutation, and refuses mismatches. `bin/rig-runtime check <team>...` validates settings and selected CLI/profile prerequisites before job mutations and prints exactly `codex`, `claude-code`, or `both` on stdout; diagnostics go to stderr. Codex auto requires an identical installed profile and successful `codex -p openrig-auto mcp list` loader probe (captured output, 10-second timeout). Permission application queries `rig ps --nodes --rig <rig-name> --json`, verifies every expected seat runtime before any mutation, and then sets Claude modes. Exit 0 success, 1 failure. Claude auto maps to `rig seat set-permissions <pod>-<member>@<rig-name> --mode auto --reason <reason>`; native maps to `floor`. Codex auto adds `codex_config_profile: openrig-auto`; native omits it. No bypass modes or broad command allowances are added.
- C5 Wrapper actions: existing `plan|up|down|resume|remove|name` retain meaning; `permissions` explicitly applies saved Claude preferences. Plan generates a separate ignored `.plan.yaml` and prints deferred permission steps without executing them. Up renders, launches, then saves Claude choices with a clear next-launch notice. Resume applies configured Claude choices to verified existing seats before `rig up <name> --existing`; it never changes the stored harness of a seat. Harness and Codex named-profile changes affect newly generated rigs; changing an existing rig's harness requires deliberate recreation outside this feature. Claude approval changes are the explicit supported exception: permissions/resume applies the saved choice to verified same-runtime seats for their next launch. `rig-job` validates selected teams before branch/worktree changes and passes selected runtime information to exclusions.
- C6 Exclusions: `bin/rig-exclude <project> [--runtime codex|claude-code|both]`; default `both` preserves existing calls. Runtime-specific collision checks cover only selected runtimes; exclusion blocks retain previously installed artifact patterns so simultaneous jobs using other runtimes stay hidden. Keep current refusal of tracked generated files. Job launch computes the union of effective runtimes across its selected teams and supplies it. Project instruction bridging remains the project profile's responsibility; never overwrite or copy instruction files generically.
- Project doctor uses the same runtime union for its selected/default departments, so it does not report collisions for an unselected harness.

## Elements
### E1 configuration and setup — modify `bin/setup`, new `lib/runtime-config.mjs`
- Serves: AC1, AC3, AC5
- Responsibility: Validate and persist explicit machine preferences and install only the selected runtime's optional profile.
- Needs: C1, C2, C3; existing `profiles/openrig-auto.config.toml` and setup links.
- Produces: C1 file, optional Codex profile, existing setup links/folders, `tests/runtime-config.test.mjs`.
- Interface: C2 and C3.
- Rules: Atomic configuration writes; invalid selections and conflicting existing profiles fail before mutation; preserve existing settings and staged files; no runtime/auth installation.
- Verified by: Node tests for new/repeated/noninteractive/planned/mixed setup and preservation/conflict behavior in temporary roots.
- Open: none.

### E2 runtime generation and lifecycle — new `bin/rig-runtime`, modify `bin/rig-home`, `bin/rig-team`, `bin/rig-job`, `bin/rig-exclude`, `.gitignore`
- Serves: AC2, AC3, AC4, AC5
- Responsibility: Render selected runtimes and apply supported approval choices consistently across launch entry points.
- Needs: C1, C2, C4, C5, C6; `bin/rig-team:31` write_spec, `bin/rig-home:20` dispatch, existing rig templates.
- Produces: Generated ignored specs, explicit Claude permission selections, `tests/runtime-launch.test.mjs`.
- Interface: C4, C5, C6.
- Rules: No lifecycle operation during tests against real rigs; preflight before job mutation; do not invent a Claude permission YAML field; stop on errors; plan cannot change live permission state; down/remove/name do not depend on runtime settings.
- Verified by: Mixed YAML validated with installed RigSpecSchema; mocked command sequencing and failure tests; runtime-specific collision tests.
- Open: none.

### E3 shared templates and documentation — modify `agents/*/*/agent.yaml`, `rigs/*/rig.yaml`, role guidance, `culture/CULTURE.md`, `README.md`, `AGENTS.md`, `docs/codex-setup.md`, `docs/project-profile.md`; new `CLAUDE.md`, `docs/setup.md`
- Serves: AC2, AC3, AC4, AC5
- Responsibility: Restore dual-harness resources and describe setup without machine/project-specific policy in shared instructions.
- Needs: C1–C6; current nine AgentSpecs, five RigSpecs, existing guidance and docs.
- Produces: Shared templates and cross-harness setup instructions; `CLAUDE.md` imports `@AGENTS.md`.
- Interface: Template members use `runtime: codex` only as a renderable baseline, with no mandatory Codex profile; `managed_blocks.claude-code: CLAUDE.local.md` restored; all four original runtime resources restored and filtered by OpenRig's runtime projection.
- Rules: Keep one role/template set; clearly require wrappers to select saved preferences; preserve staged first-paragraph README edit; leave `docs/approval-design-session.md` untouched; do not change historical findings into claims of new live verification.
- Verified by: Read/diff review, all template schemas valid, both runtime resources present, no mandatory Codex-only instructions or machine-specific job-radar defaults.
- Open: none.

## Wiring
`setup → runtime.json → runtime helper → generated spec → rig-home / rig-team / rig-job → OpenRig`

`shared role resources + rig templates → runtime helper`

## Build order
- Wave 1: E1 and E3 in parallel.
- Wave 2: E2, consuming E1 and E3.
- Final: run combined tests and inspect the complete diff.

## Decisions
- One template set with local overrides avoids maintaining two copies of every role.
- A separate JSON file avoids changing the existing shell-sourced spawn authorization config.
- Use the installed OpenRig YAML parser/schema for compatibility without installing another dependency.
- Claude auto is saved after initial registration and applied before subsequent resume; OpenRig 0.6.4 does not expose it as a RigSpec field. Never claim first-launch auto.
- Keep job-radar configuration machine-local; shared docs explain profile contracts.

## Risks and unknowns
- Live Claude auto eligibility depends on the installed executable/account/managed policy; E2 must propagate OpenRig's refusal without fallback.
- Tests can verify generation and lifecycle sequencing without proving native interactive behavior; report that limit.
- Codex writes AGENTS.md; tracked instruction collisions continue to require deliberate project handling.
