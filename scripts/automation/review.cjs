const { classifyFiles, latestReviews, validAttestation } = require('./policy.cjs');
const writeRoles = new Set(['admin', 'maintain', 'write']);
async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const dispatch = context.eventName === 'workflow_dispatch';
  const inputs = context.payload.inputs || {};
  const number = dispatch ? inputs.pr : context.payload.pull_request?.number;
  if (!/^[1-9]\d*$/.test(String(number))) throw Error('A valid PR number is required.');
  const { data: pull } = await github.rest.pulls.get({ owner, repo, pull_number: Number(number) });
  if (pull.state !== 'open' || pull.base.ref !== 'main') {
    core.notice('Closed/non-main PR left unchanged.');
    return;
  }
  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pull.number,
    per_page: 100,
  });
  const risk = classifyFiles(files, pull.changed_files);
  let approved = false,
    reviewer = '',
    attestation = false,
    issue = '';
  const isWriter = async (login) => {
    const { data: user } = await github.rest.users.getByUsername({ username: login });
    if (user.type !== 'User') return false;
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username: login,
    });
    return writeRoles.has(data.permission);
  };
  if (risk.manual) {
    const reviews = latestReviews(
      await github.paginate(github.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: pull.number,
        per_page: 100,
      }),
    );
    const blocking = [];
    for (const review of reviews)
      if (
        review.state === 'CHANGES_REQUESTED' &&
        review.user.type === 'User' &&
        (await isWriter(review.user.login))
      )
        blocking.push(review.user.login);
    if (blocking.length)
      issue = 'Changes requested by a maintainer must be resolved before merging.';
    else if (
      dispatch &&
      validAttestation(
        { ...inputs, reviewed: inputs.reviewed === 'true' || inputs.reviewed === true },
        pull,
      ) &&
      (await isWriter(context.actor))
    ) {
      approved = true;
      reviewer = context.actor;
      attestation = true;
    } else {
      for (const review of reviews)
        if (
          review.state === 'APPROVED' &&
          review.commit_id === pull.head.sha &&
          review.user.type === 'User' &&
          review.user.login !== pull.user.login &&
          (await isWriter(review.user.login))
        ) {
          approved = true;
          reviewer = review.user.login;
          break;
        }
      if (!approved) {
        const checks = await github.paginate(github.rest.checks.listForRef, {
          owner,
          repo,
          ref: pull.head.sha,
          // GitHub defaults to latest: a newer failed evaluation can hide the
          // successful manual attestation from a different workflow run.
          // Search all runs; the strict PR/SHA/app/actor checks below still apply.
          filter: 'all',
          per_page: 100,
        });
        for (const check of checks) {
          const prefix = `manual-review:${pull.number}:${pull.head.sha}:`;
          if (
            check.name === 'Merge policy' &&
            check.head_sha === pull.head.sha &&
            check.status === 'completed' &&
            check.app?.slug === 'github-actions' &&
            check.conclusion === 'success' &&
            check.external_id?.startsWith(prefix)
          ) {
            const actor = check.external_id.slice(prefix.length);
            if (await isWriter(actor)) {
              approved = true;
              reviewer = actor;
              attestation = true;
              break;
            }
          }
        }
      }
      if (!approved)
        issue =
          'Manual review required for this exact head SHA. Approve the PR then rerun this workflow, or use its explicit maintainer review attestation.';
    }
  }
  if (pull.labels.some((l) => l.name === 'do-not-merge'))
    issue = 'do-not-merge hold: remove the hold only after reviewing the issue.';
  const pass = !issue && (!risk.manual || approved);
  const summary = [
    `Head: ${pull.head.sha}`,
    risk.manual
      ? 'Manual review required.'
      : 'Presentation/documentation/test-only change eligible for opt-in auto-merge.',
    ...risk.reasons,
    reviewer ? `Manually reviewed by @${reviewer} at this exact commit.` : '',
    issue,
  ]
    .filter(Boolean)
    .join('\n\n');
  // Re-read the PR to avoid posting an old review as approval for a newer push.
  const { data: fresh } = await github.rest.pulls.get({ owner, repo, pull_number: pull.number });
  if (fresh.head.sha !== pull.head.sha)
    throw Error('PR changed during review. Rerun on its latest head.');
  await github.rest.checks.create({
    owner,
    repo,
    name: 'Merge policy',
    head_sha: pull.head.sha,
    status: 'completed',
    conclusion: pass ? 'success' : 'failure',
    external_id: attestation
      ? `manual-review:${pull.number}:${pull.head.sha}:${reviewer}`
      : `policy:${pull.number}:${pull.head.sha}`,
    details_url: `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`,
    output: { title: pass ? 'Merge policy satisfied' : 'Manual review / action required', summary },
  });
  await core.summary.addHeading('Merge policy').addRaw(summary).write();
  if (!pass) core.setFailed(issue || 'Manual review required for this head.');
}
module.exports = { run };
