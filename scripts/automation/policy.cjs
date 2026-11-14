// This code runs only from the trusted default-branch workflow, never a PR checkout.
const REQUIRED_CHECKS = ['build', 'Merge policy'];
const OPT_IN = 'auto-merge';
const sensitive =
  /(?:^|\/)(?:AGENTS\.md|CODEOWNERS)$|^\.github\/|^scripts\/|^legacy\/|^(?:package(?:-lock)?\.json|(?:vite|playwright)\.config\..*|tsconfig.*\.json)$|^src\/(?:data|controller|live-sets|performance|programs|program-schedule|plan-storage|auto-selection|calendar(?:-completion)?|workout-(?:completion|results)|reorder-exercises)\.ts$|^src\/(?:importing\/|.*(?:backup|restore|history|streak|migrat))|^src\/(?:main|ExerciseCard|WorkoutScreens|WorkoutCompletion|ProgramEditor|PlanImporter|BackupPanel)\.tsx$/i;
const storageCode =
  /\b(?:indexedDB|localStorage|sessionStorage|saveData|loadData|finishWorkout|calculateStreak|syncStreaks|restoreDatabaseBackup|mergeBackup|openStore|IDBDatabase|IDBObjectStore|eval|Function)\b|\.(?:history|streak)\b|\bimport\s*\(/;
function classifyFiles(files, changedCount = files.length) {
  const reasons = [];
  if (!files.length || files.length !== changedCount || files.length >= 3000)
    reasons.push('Incomplete or oversized changed-file listing.');
  for (const file of files) {
    for (const path of [file.filename, file.previous_filename].filter(Boolean)) {
      if (sensitive.test(path)) {
        reasons.push(`Protected logic or governance: ${path}`);
        continue;
      }
      const presentation = /^src\/.*\.(?:css|tsx)$/.test(path);
      const docs = path === 'README.md' || /^docs\//.test(path);
      const tests = /^tests\//.test(path);
      const images = /^public\/.*\.(?:png|jpe?g|webp|avif)$/i.test(path);
      if (!presentation && !docs && !tests && !images) {
        reasons.push(`Unclassified file needs review: ${path}`);
        continue;
      }
      if ((presentation || tests) && file.status === 'removed')
        reasons.push(`Source or test deletion needs review: ${path}`);
      if (/^src\/.*\.tsx$/.test(path) && (!file.patch || storageCode.test(file.patch)))
        reasons.push(`Storage-related or unavailable component diff: ${path}`);
    }
  }
  return { manual: reasons.length > 0, reasons: [...new Set(reasons)] };
}
const latestChecks = (checks) => {
  const result = new Map();
  for (const check of checks)
    if (!result.has(check.name) || result.get(check.name).id < check.id)
      result.set(check.name, check);
  return result;
};
function autoMergeBlock({ pull, repo, branch, files, checks }) {
  if (pull.state !== 'open' || pull.draft) return 'PR is closed or draft.';
  if (!pull.labels.some((l) => l.name === OPT_IN))
    return 'No explicit auto-merge opt-in label; PR is unchanged.';
  if (pull.labels.some((l) => l.name === 'do-not-merge')) return 'A do-not-merge hold is present.';
  if (pull.head.repo?.full_name !== repo.full_name || pull.base.ref !== repo.default_branch)
    return 'Only same-repository PRs into the default branch are eligible.';
  if (classifyFiles(files, pull.changed_files).manual)
    return 'Data-sensitive, governance or unclassified changes require manual review and merging.';
  if (!repo.allow_auto_merge || !repo.allow_squash_merge)
    return 'Repository auto-merge and squash merging must be enabled.';
  const required = branch.protection?.required_status_checks;
  const names = new Set([
    ...(required?.contexts || []),
    ...(required?.checks || []).map((c) => c.context),
  ]);
  if (!branch.protected || !REQUIRED_CHECKS.every((name) => names.has(name)))
    return 'Main must protect the required build and Merge policy checks. No merge was requested.';
  if (
    pull.mergeable !== true ||
    ['dirty', 'unknown', 'behind', 'blocked'].includes(pull.mergeable_state)
  )
    return 'Merge conflicts, stale base, pending review or unknown mergeability need attention.';
  const latest = latestChecks(checks);
  for (const name of REQUIRED_CHECKS) {
    const c = latest.get(name);
    if (
      !c ||
      c.head_sha !== pull.head.sha ||
      c.app?.slug !== 'github-actions' ||
      c.status !== 'completed' ||
      c.conclusion !== 'success'
    )
      return `Latest ${name} check has not succeeded on the current PR head.`;
  }
  if (
    [...latest.values()].some((c) =>
      ['failure', 'timed_out', 'cancelled', 'action_required', 'stale'].includes(c.conclusion),
    )
  )
    return 'A current-head check failed, was cancelled or requires attention.';
  return null;
}
function latestReviews(reviews) {
  const latest = new Map();
  for (const review of [...reviews].sort(
    (a, b) => (Date.parse(a.submitted_at) || 0) - (Date.parse(b.submitted_at) || 0) || a.id - b.id,
  ))
    if (review.user?.login && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state))
      latest.set(review.user.login, review);
  return [...latest.values()];
}
const validAttestation = (inputs, pull) =>
  inputs.reviewed === true &&
  inputs.head_sha === pull.head.sha &&
  /^[a-f0-9]{40}$/.test(inputs.head_sha);
module.exports = {
  REQUIRED_CHECKS,
  OPT_IN,
  classifyFiles,
  latestChecks,
  autoMergeBlock,
  latestReviews,
  validAttestation,
};
