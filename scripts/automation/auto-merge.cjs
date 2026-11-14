const { autoMergeBlock } = require('./policy.cjs');
async function run({
  github,
  context,
  core,
  enabled = process.env.ENABLED,
  requestedPR = process.env.REQUESTED_PR,
}) {
  const { owner, repo } = context.repo,
    notes = [];
  if (enabled !== 'true') {
    core.notice('Auto-merge configuration is not enabled; no PR was changed.');
    return ['Auto-merge configuration is not enabled.'];
  }
  const workflow = context.payload.workflow_run;
  const dispatch = context.eventName === 'workflow_dispatch';
  const requested = requestedPR || (dispatch ? context.payload.inputs?.pr : null);
  if ((dispatch || requested) && !/^[1-9]\d*$/.test(String(requested)))
    throw Error('A valid PR number is required.');
  let numbers = requested
    ? [Number(requested)]
    : (workflow?.pull_requests || []).map((p) => p.number);
  // GitHub sometimes omits run.pull_requests. Recover only PRs explicitly associated
  // with the tested head commit, not a repository-wide scan or a guessed branch.
  if (!numbers.length && workflow?.event === 'pull_request' && workflow.conclusion === 'success') {
    const associated = await github.paginate(
      github.rest.repos.listPullRequestsAssociatedWithCommit,
      { owner, repo, commit_sha: workflow.head_sha, per_page: 100 },
    );
    numbers = associated
      .filter((p) => p.state === 'open' && p.head.sha === workflow.head_sha)
      .map((p) => p.number);
  }
  if (!numbers.length)
    notes.push(
      'No linked PR in this run. No PR was changed. A maintainer can dispatch this workflow for a specific future opt-in PR.',
    );
  if (!requested && !dispatch && workflow?.conclusion !== 'success')
    notes.push('Triggering workflow failed or is unfinished. No PR was changed.');
  else
    for (const number of numbers) {
      try {
        const { data: pull } = await github.rest.pulls.get({ owner, repo, pull_number: number });
        if (
          !requested &&
          !dispatch &&
          workflow.name === 'Deploy GitHub Pages' &&
          (workflow.event !== 'pull_request' || workflow.head_sha !== pull.head.sha)
        ) {
          notes.push(`#${number}: Old/non-PR build; left open.`);
          continue;
        }
        const [{ data: repository }, { data: branch }, files, checks] = await Promise.all([
          github.rest.repos.get({ owner, repo }),
          github.rest.repos.getBranch({ owner, repo, branch: 'main' }),
          github.paginate(github.rest.pulls.listFiles, {
            owner,
            repo,
            pull_number: number,
            per_page: 100,
          }),
          github.paginate(github.rest.checks.listForRef, {
            owner,
            repo,
            ref: pull.head.sha,
            per_page: 100,
          }),
        ]);
        const blocked = autoMergeBlock({ pull, repo: repository, branch, files, checks });
        if (blocked) {
          notes.push(`#${number}: ${blocked}`);
          continue;
        }
        if (pull.auto_merge) {
          notes.push(`#${number}: Auto-merge already enabled; no change.`);
          continue;
        }
        const { data: fresh } = await github.rest.pulls.get({ owner, repo, pull_number: number });
        if (
          fresh.head.sha !== pull.head.sha ||
          fresh.state !== 'open' ||
          fresh.draft ||
          !fresh.labels.some((l) => l.name === 'auto-merge') ||
          fresh.labels.some((l) => l.name === 'do-not-merge')
        ) {
          notes.push(`#${number}: PR changed during verification; left open.`);
          continue;
        }
        // This is the only merge mutation. Native GitHub rules still control when/if merging occurs.
        await github.graphql(
          'mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number}}}',
          { id: pull.node_id },
        );
        notes.push(
          `#${number}: Native auto-merge enabled for the verified low-risk head ${pull.head.sha}.`,
        );
      } catch (error) {
        core.warning(`PR #${number} left unchanged: ${error.message}`);
        notes.push(`#${number}: Permissions/API error; left open. ${error.message}`);
      }
    }
  for (const note of notes) core.notice(note);
  await core.summary.addHeading('Guarded auto-merge').addList(notes).write();
  return notes;
}
module.exports = { run };
