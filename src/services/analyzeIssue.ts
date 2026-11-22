import { generateHints, type HintEngineOptions, type HintResult } from '../hints/generateHints';
import { loadGithubContext, type GithubContextOptions, type GithubContextResult } from '../github/loadGithubContext';
import { parseStackTrace, type ParsedStackTrace } from '../parser/parseStackTrace';

export interface AnalyzeIssueResult {
  status: 'ok' | 'no-trace';
  message?: string;
  issueWarning?: string;
  trace?: ParsedStackTrace;
  github?: GithubContextResult;
  hints?: HintResult;
}

export interface AnalyzeIssueOptions {
  issueWarning?: string;
  hintOptions?: HintEngineOptions;
  githubOptions?: GithubContextOptions;
  loadGithubContextFn?: typeof loadGithubContext;
  generateHintsFn?: typeof generateHints;
}

/** Run the shared parse → repository-context → hint flow used by the panel and Rovo action. */
export async function analyzeIssue(issueText: string, options: AnalyzeIssueOptions = {}): Promise<AnalyzeIssueResult> {
  const trace = parseStackTrace(issueText);
  if (!trace) {
    return {
      status: 'no-trace',
      message: 'No supported stack trace was found in this Jira issue. Add the error and stack frames to the description or a comment, then try again.',
      issueWarning: options.issueWarning,
    };
  }

  const loadContext = options.loadGithubContextFn ?? loadGithubContext;
  const createHints = options.generateHintsFn ?? generateHints;
  const github = await loadContext(issueText, trace.relevantFrame, options.githubOptions);
  const sourceSnippet = github.status === 'ok' ? github.snippet : undefined;
  const hints = await createHints(trace, sourceSnippet, options.hintOptions);

  return {
    status: 'ok',
    issueWarning: options.issueWarning,
    trace,
    github,
    hints,
  };
}
