import Resolver from '@forge/resolver';
import { analyzeIssue } from '../services/analyzeIssue.ts';

const resolver = new Resolver();

resolver.define('analyzeIssue', async (req) => {
  const payload = req?.payload ?? {};
  const issueText = typeof payload.issueText === 'string' ? payload.issueText : '';
  const issueWarning = typeof payload.issueWarning === 'string' ? payload.issueWarning : undefined;
  return analyzeIssue(issueText, { issueWarning });
});

export const handler = resolver.getDefinitions();
