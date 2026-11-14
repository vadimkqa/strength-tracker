# Strength Tracker development workflow

- Develop each update on a separate branch based on current `main`. Inspect Git status and preserve any interrupted work before editing. Create a PR for every completed update.
- Before marking an update complete, run `npm run test:workflow`, `npm test`, `npm run build` (includes `tsc --noEmit`) and relevant Playwright browser tests. CI runs the entire browser suite. Never weaken checks, bypass failed checks, force-merge, or delete user data to make tests pass.
- Preserve saved workout history, imported programs, active sessions, PRs, streak achievements, backups and offline behavior. Do not combine plan data and saved performance.
- Changes to migrations, storage, backup/restore, workout history, streak calculations, dependency/CI governance or other protected/unclassified logic need manual review at the exact PR head. Do not add the `auto-merge` label or enable auto-merge for these changes. Leave their PR open for the user to review and merge.
- Completed low-risk presentation/documentation updates may use the `auto-merge` label after local verification. The trusted automation may enable native GitHub auto-merge only when repository setup is complete, protected required checks succeed on the current head, and the file policy allows it. Never call a direct merge endpoint, use `--admin`, or weaken protection when automation declines a PR.
- Do not add that label to existing unfinished PRs or bulk-enable auto-merge. The workflow/bootstrap PR itself requires manual review. Default activation is off until an administrator completes the setup in `docs/DEVELOPMENT_WORKFLOW.md`.
- If tests fail, conflicts occur or permissions prevent merging, keep the PR open and report the failing check/conflict/permission. Fix ordinary implementation errors on the branch and re-run relevant checks; do not bypass the failure to merge. Report auto-merge queueing separately from actual merge/deployment success.
- Manual review means either a current-head approval by another human maintainer and a rerun of Merge policy, or an explicit human maintainer attestation using its main-branch workflow dispatch with the exact SHA. It is not a bot approval. Data-sensitive PRs still require a human to merge them.
- Do not split, rename or relocate sensitive logic into presentation files to evade the risk classifier. The classifier is intentionally conservative; UI edits in the app's central persistence/controller modules can require review too.
- After an authorized low-risk merge, let the existing main-branch GitHub Pages workflow publish. Never dispatch a deployment from an unmerged feature branch. If CI or deployment fails, report it; do not reset saved application data.

See [setup, policy and troubleshooting](docs/DEVELOPMENT_WORKFLOW.md).
