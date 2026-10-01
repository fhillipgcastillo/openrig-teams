# Culture — how every seat in these teams works

These rules apply to every rig in this repository. Project rules (code style,
tests, tooling) come from the project's own `CLAUDE.md` in the seat's working
directory and take precedence for anything about the code itself.

## Who talks to whom

- The human talks to the **lead**. Only the lead reports back to the human.
- The lead delegates to department teams. Teams report to the lead, never
  around it.
- Every message you send carries your seat name; every reply goes back to the
  seat that asked.

## Work ownership

- Every job is one queue item with one owner (`rig queue`). Hand off by closing
  yours into the next owner's, so nothing is left without an owner.
- Run each `rig` command on its own, never chained with other commands in one
  shell call.
- Pass briefs and handoffs inline: `rig queue create … --body "<brief>"` and
  `rig send <seat> "<text>"`. Never write brief or scratch files outside your
  own working directory.
- One job = one worktree = one branch. A team works only inside its own
  worktree. Never edit another team's worktree or the project's main checkout.

## Hard limits (no exceptions, no asking to bypass)

- Never `git commit`, `git push`, open a PR, or merge. The human does that.
- Never create or edit release metadata: changesets, CHANGELOG entries,
  version bumps, tags, release notes. CI owns it.
- Never start, stop or reset the human's own running services or databases.
  If something you need is down, report it to the lead and wait.
- Only run a stack or end-to-end tests when the assignment says so, and only
  through the project's own isolation tooling (its own ports/slot), never the
  human's instance.
- Cloud or infrastructure changes happen only after the human approves them
  through the lead.

## Reporting

- Report what you did, with evidence (command output, file paths). Say what
  you did not check.
- Answer what was asked. No adjacent scenarios, no unrequested offers.
- When blocked, say so in one line with the blocker, and stop.
