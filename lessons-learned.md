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
