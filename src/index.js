import api, { route } from '@forge/api';
import { analyzeIssue } from './services/analyzeIssue.ts';
import { loadIssueText } from './services/loadIssueText.ts';
import { handleRovoAction } from './rovo/rovoAction.ts';

export { handler } from './resolvers';

/**
 * Rovo actions receive an issue key as model-provided input. Restrict the API
 * wrapper to the two read endpoints used by loadIssueText, then let Jira enforce
 * the invoking user's normal issue visibility with asUser().
 */
function requestJiraAsCurrentUser(uri) {
  const issueMatch = /^\/rest\/api\/3\/issue\/([A-Za-z][A-Za-z0-9_]*-\d+)(\?fields=description|\/comment\?startAt=(\d+)&maxResults=(\d+))$/.exec(uri);
  if (!issueMatch) throw new Error('Unsupported Jira read request.');

  const [, issueKey, requestType, startAt, maxResults] = issueMatch;
  if (requestType.startsWith('/comment')) {
    return api.asUser().requestJira(
      route`/rest/api/3/issue/${issueKey}/comment?startAt=${Number(startAt)}&maxResults=${Number(maxResults)}`,
    );
  }
  return api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=description`);
}

/** Entry point declared for the Rovo action module in manifest.yml. */
export async function rovoAction(payload, context) {
  return handleRovoAction(payload, context, {
    loadIssueTextFn: (issueKey) => loadIssueText(issueKey, requestJiraAsCurrentUser),
    analyzeIssueFn: analyzeIssue,
  });
}
