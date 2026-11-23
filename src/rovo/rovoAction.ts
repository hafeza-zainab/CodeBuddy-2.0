import { analyzeIssue, type AnalyzeIssueResult } from '../services/analyzeIssue';
import { ANALYSIS_DEADLINE_MS } from '../services/analysisBudget';
import { loadIssueText, type IssueTextOptions, type IssueTextResult } from '../services/loadIssueText';

type ActionPayload = {
  issueKey?: unknown;
  trace?: unknown;
  pastedTrace?: unknown;
  context?: { jira?: { issueKey?: unknown } };
};

type ActionContext = {
  extension?: { issueKey?: unknown; issue?: { key?: unknown } };
};

export interface RovoActionDependencies {
  loadIssueTextFn?: (issueKey: string, options?: IssueTextOptions) => Promise<IssueTextResult>;
  analyzeIssueFn?: typeof analyzeIssue;
}

function validIssueKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(value.trim());
}

/**
 * Run the shared CodeBuddy analysis for either a pasted trace or an issue key.
 * Issue reads are injected so the Forge wrapper can use api.asUser(), while the
 * action tests can mock every request without an Atlassian site.
 */
export async function handleRovoAction(
  payload: ActionPayload = {},
  context: ActionContext = {},
  dependencies: RovoActionDependencies = {},
): Promise<AnalyzeIssueResult | { status: 'input-required' | 'issue-read-failed'; message: string }> {
  const analyze = dependencies.analyzeIssueFn ?? analyzeIssue;
  const deadlineAt = Date.now() + ANALYSIS_DEADLINE_MS;
  const pastedTrace = typeof payload.trace === 'string'
    ? payload.trace.trim()
    : typeof payload.pastedTrace === 'string' ? payload.pastedTrace.trim() : '';

  if (pastedTrace) return analyze(pastedTrace, { deadlineAt });

  const issueCandidate = payload.issueKey
    ?? payload.context?.jira?.issueKey
    ?? context.extension?.issue?.key
    ?? context.extension?.issueKey;
  if (!validIssueKey(issueCandidate)) {
    return {
      status: 'input-required',
      message: 'Provide a valid Jira issue key or paste a stack trace to receive the three hints.',
    };
  }

  const fetchIssueText = dependencies.loadIssueTextFn
    ?? ((key: string, options?: IssueTextOptions) => loadIssueText(key, async () => {
      throw new Error('Jira issue access is unavailable in this action context.');
    }, options));
  try {
    const issueContent = await fetchIssueText(issueCandidate.trim(), { deadlineAt });
    return analyze(issueContent.text, { issueWarning: issueContent.warning, deadlineAt });
  } catch (error) {
    const detail = error instanceof Error && /^Could not load (?:the Jira issue description|Jira issue comments)/.test(error.message)
      ? error.message
      : 'Could not read the Jira issue after the permitted attempts.';
    return {
      status: 'issue-read-failed',
      message: `${detail} Check the issue key and the user’s Jira access, or paste the stack trace directly.`,
    };
  }
}
