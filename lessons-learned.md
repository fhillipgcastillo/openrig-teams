# Dated lessons learned

## 2026-10-03 — Project onboarding must not replace shared harness support

**Mistake:** While configuring the machine-local job-radar profile, a previous
session converted the shared team templates and setup guidance to Codex-only,
removed Claude runtime resources, and made Codex auto-review unconditional.

**Rule:** Keep project onboarding in the machine-local project profile. Shared
templates must support the user's selected harnesses without removing another
harness's resources or instructions. Verify OpenRig's installed behavior and
official documentation before changing runtime or approval settings. Store
machine preferences separately from reusable role definitions.

**Trigger:** Onboarding a project, switching coding CLIs on one machine, or
configuring approvals in openrig-teams.

## 2026-10-04 — Trace package-manager selection before recommending version changes

**Mistake:** Earlier replies recommended aligning the global pnpm version with
the project pin without tracing why job setup selected the global version.

**Rule:** Compare the exact profile invocation with execution inside the
worktree. Corepack selects a package manager using the process working
directory before pnpm handles `--dir`. Run project package-manager commands
from the worktree so its committed pin controls selection. Downloading a newer
version can also update Corepack's default and temporarily conceal this bug;
verify against a different default in an isolated cache configuration.

**Trigger:** Investigating pnpm version mismatches during rig-job preparation.
