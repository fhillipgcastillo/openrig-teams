# Findings — what was tested (2026-10-01, OpenRig 0.6.3, WSL2 Ubuntu)

All tests ran in a scratch lab (`/tmp/openrig-lab`: throwaway repos and
worktrees). Status: ✅ verified by running it · ⚠ documented or read in source,
not exercised · ❌ does not work.

## Naming and multiple worktrees

| Claim | Status | Evidence |
|---|---|---|
| The same rig name cannot run twice | ✅ | second `rig up` → "A rig named "fe" is already RUNNING … Nothing was created or launched … launch this spec under a different name" |
| `rig up` has no rename flag; the name is the spec's `name:` | ✅ | `rig up --help` |
| A generated copy per worktree runs side by side, each seat in its own worktree | ✅ | two copies, `tmux display '#{pane_current_path}'` showed each worktree |
| `rig send` reaches the right copy | ✅ | per-copy messages landed only in their own pane |
| A lead in one rig delegates to a team in another rig, and the team replies | ✅ | lead → `dev-builder@fe-wt-job-a` created NOTE.md and replied; also across two projects |
| Lead dispatch through `rig queue create --body` runs prompt-free | ✅ | lead with the inline-brief rule dispatched with no prompt |
| `rig-team` names include the project, so same-named worktrees in two projects don't collide | ✅ | `fe-other-project-other-wt-job-x` vs `fe-repo-wt-job-a` |

## Permissions

| Claim | Status | Evidence |
|---|---|---|
| Claude seats launch with `--permission-mode acceptEdits` | ✅ | the seat's process command line |
| `Bash(rig:*)` in `~/.claude/settings.json` removes the startup prompts | ✅ | lead and FE seats booted idle, no prompt |
| Builders/testers still prompt on non-`rig` shell commands | ✅ | builder prompted on `printf … >> NOTE.md; xxd` |
| Chaining `rig` with other commands defeats the `rig` rule | ✅ | lead prompted on `rig queue --help; ls …; cat …` |
| Reading outside the seat's own folder prompts | ✅ | "Yes, allow reading from /tmp/openrig-lab/… from this project" |
| A team file / policy cannot select `auto` | ⚠ | source: `policy-spec.js` accepts `launch_posture` `floor` / `full_bypass` only; built-ins `locked`/`standard`/`open` = floor, `yolo` = full_bypass |
| `rig seat set-permissions <seat> --mode auto` selects auto for the next launch | ⚠ | `rig seat set-permissions --help`, `~/.openrig/reference/getting-started.md`; installed `claude --help` lists `auto` |
| `defaultMode` in Claude settings does not override OpenRig's launch flag | ⚠ | OpenRig docs: launch flags outrank project/user settings |

## Files OpenRig writes into a seat's folder

| Claim | Status | Evidence |
|---|---|---|
| `.claude/` (settings.local.json, skills, plugins), `.mcp.json` (exa, context7), `.openrig/` (hooks) | ✅ | `ls -a` after launch |
| Managed instructions go to `CLAUDE.md` by default | ✅ | appeared in the lab worktree |
| `managed_blocks: { claude-code: CLAUDE.local.md }` redirects them | ✅ | lead and FE seats wrote `CLAUDE.local.md`, no `CLAUDE.md` |
| One `.git/info/exclude` hides them in every worktree of that repo, not other repos | ✅ | `bin/rig-exclude` on the lab repo: worktree showed only real work files; second project unaffected; rerun keeps one block |
| `rig-exclude` refuses when the project tracks a path OpenRig writes | ✅ | tracked `.mcp.json` → exit 2, exclude file unchanged |
| skoolscout-com tracks none of those paths | ✅ | `git ls-files` for each path (its own `.claude/skills/*` are different names) |
| A first launch adds the folder to `~/.claude.json`'s trusted list | ✅ | `/tmp/openrig-lab/repo` entry |
| Your global Claude hooks run inside every seat | ✅ | `Stop says: journal · capturing` on a lab seat |

## Activity state

| Claim | Status | Evidence |
|---|---|---|
| `needs-input` from hooks is not time-bounded; it clears at the next turn (prompt submit / turn end) | ⚠ | source: `seat-activity-service.js`, `routes/activity.js` |
| Approving a prompt sends no event; an Esc-interrupt fires no turn-end hook | ⚠ | OpenRig's Claude hook map has no PostToolUse; seat showed "Interrupted" and stayed flagged |
| Fix: send the seat any new message | ⚠ | follows from the above; not exercised |

## Resources

| Claim | Status | Evidence |
|---|---|---|
| ~310 MB per `claude` process, ~660 MB with its MCP children | ✅ | RSS of three running seats |
| A skoolscout worktree is ~215 MB source; `node_modules` hardlinked | ✅ | `du` on an existing worktree |

## Not exercised

- `rig-team … down` → `resume` cycle (`rig down --snapshot`, `rig up <name> --existing`).
- The full builder → reviewer + tester chain end to end (stopped at the builder's
  shell prompt — needs auto mode).
- Auto mode on any seat.
