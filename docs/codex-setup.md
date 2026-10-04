# Codex setup details

Choose Codex, Claude Code, or mixed seats through the shared [setup guide](setup.md).
Codex does not require installing Claude Code. These details supplement that
guide for machines with Codex seats.

Verify `codex --version` and `codex login status`. Back up
`${CODEX_HOME:-$HOME/.codex}/config.toml` before a first launch. OpenRig installs
its Codex runtime resources and workspace integration during launch.

```sh
bin/setup --runtime codex --codex-approvals native --plan
bin/setup --runtime codex --codex-approvals native
bin/rig-home lead plan
```

OpenRig 0.6.4's bare `rig setup` attempts to install Claude Code; use this
repository's `bin/setup` for the selected harnesses instead.

## Optional auto-review

Select auto-review with `bin/setup --codex-approvals auto` when Codex is already
selected, or include `--runtime codex` for initial setup. Only effective Codex
auto seats receive `codex_config_profile: openrig-auto` in generated specs.
Setup installs the matching profile at
`${CODEX_HOME:-$HOME/.codex}/openrig-auto.config.toml`:

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"
approvals_reviewer = "auto_review"
```

An identical existing file is preserved; a differing file stops setup without
overwriting it. Launch preflight requires the matching file and checks whether
`codex -p openrig-auto mcp list` can load it. Native project/managed rules can
restrict these settings. Approval rejections and startup trust decisions can
still require human input.
See [official auto-review documentation](https://learn.chatgpt.com/docs/sandboxing/auto-review).

Existing rigs retain their stored Codex profile on resume. Changing saved
preferences selects the profile for newly generated rigs; it does not restart
or reconfigure running seats. See [approval timing](setup.md#approval-modes-and-existing-seats).

The lead-mediated approval proposal remains a separate discussion in
[`approval-design-session.md`](approval-design-session.md).

## Daemon access from seats

The workspace sandbox can block `rig` from reaching the local daemon even when
it is healthy. Retry a failed coordination command through Codex's native
approval mechanism with `sandbox_permissions: require_escalated`, using a narrow
prefix for the command when appropriate. Respect rejected approvals and managed
restrictions. Do not enable unrestricted access or restart rigs for a sandbox
connection failure. Successful discovery must precede any conclusion that a
team is missing; see [Codex security](https://learn.chatgpt.com/docs/security).
