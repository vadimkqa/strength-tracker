# Strength Tracker development workflow

- Develop each update on a separate branch based on current `main`. Inspect Git status and preserve interrupted work. Create a PR for each completed update.
- Run `npm run test:workflow`, `npm test`, `npm run build` (includes TypeScript) and relevant browser tests before handoff. CI runs the full Chromium suite and mobile WebKit regressions against the production build. Never weaken tests, bypass failed checks, force-merge or delete user data to make tests pass.
- Preserve workout history, imported programs, active sessions, PRs, achievements, backups and offline behavior. Keep plans separate from completed performance.
- GitHub's required checks are `build`, `mobile (chromium)` and `mobile (webkit)`. There is no custom review check, maintainer attestation, SHA approval form, merge label or privileged merge bot.
- Future completed low-risk UI/documentation changes may use GitHub's native **Enable auto-merge → Squash** (or `gh pr merge --auto --squash`) only after verifying that `main` actively enforces all three required checks with no bypass. Never queue auto-merge while protection is missing or unverifiable. This is per-PR opt-in, not bulk activation.
- Data migrations, destructive changes, changes that could affect saved workout history/backup restoration/streak calculations, and workflow/governance changes require manual human review. Leave these PRs open and do not enable auto-merge. If unsure about risk, use manual review. No special workflow dispatch or exact-SHA attestation is required.
- Do not auto-merge existing unfinished PRs. Do not merge this workflow-simplification PR automatically. If tests fail, conflicts occur or permissions are missing, leave the PR open and report the issue.
- Let the existing main-branch Pages workflow deploy only after build and both mobile test jobs succeed. Never deploy an unmerged feature branch. Report auto-merge queueing separately from actual merge/deployment success.

See [required GitHub settings and normal merge steps](docs/DEVELOPMENT_WORKFLOW.md).
