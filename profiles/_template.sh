# Project profile for rig-job. Copy with: bin/rig-job profile-init <project>
# Lives in ~/.config/openrig-teams/projects/<project>.sh, outside this repo.
# Sourced by bash. What to decide: docs/project-profile.md

PROJECT_PATH="$HOME/path/to/main-checkout"
BASE_BRANCH=develop
DEFAULT_TEAMS=fe
COPY_FILES=()

# Optional hooks. Each may use: PROJECT_PATH BASE_BRANCH JOB BRANCH PLAN
# and must prefix every mutating command with `run` so --plan only prints it.

# profile_create_worktree() {
#   WORKTREE="$PROJECT_PATH/../worktrees/$JOB"
#   run git -C "$PROJECT_PATH" worktree add "$WORKTREE" "$BRANCH"
# }

# profile_prepare_worktree() {
#   run ln -sfn "$PROJECT_PATH/.env" "$WORKTREE/.env"
# }

# profile_remove_worktree() {
#   run git -C "$PROJECT_PATH" worktree remove "$WORKTREE"
# }
