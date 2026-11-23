import Resolver from '@forge/resolver';
import { analyzeIssue } from '../services/analyzeIssue';
import { ANALYSIS_DEADLINE_MS } from '../services/analysisBudget';

const resolver = new Resolver();

resolver.define('analyzeIssue', async (req) => {
  const payload = req?.payload ?? {};
  const issueText = typeof payload.issueText === 'string' ? payload.issueText : '';
  const issueWarning = typeof payload.issueWarning === 'string' ? payload.issueWarning : undefined;
  const requestedDeadline = Number(payload.deadlineAt);
  const deadlineAt = Number.isFinite(requestedDeadline)
    ? Math.min(requestedDeadline, Date.now() + ANALYSIS_DEADLINE_MS)
    : undefined;
  return analyzeIssue(issueText, { issueWarning, deadlineAt });
});

export const handler = resolver.getDefinitions();
