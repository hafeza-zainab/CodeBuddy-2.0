import { generateHints, type HintEngineOptions, type HintResult } from '../hints/generateHints';
import { loadGithubContext, type GithubContextOptions, type GithubContextResult } from '../github/loadGithubContext';
import { parseStackTrace, type ParsedStackTrace } from '../parser/parseStackTrace';
import {
  ANALYSIS_DEADLINE_MS,
  GITHUB_STAGE_BUDGET_MS,
  MIN_REQUEST_START_WINDOW_MS,
  remainingBudgetMs,
} from './analysisBudget';

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
  deadlineAt?: number;
  now?: () => number;
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
  const now = options.now ?? Date.now;
  const deadlineAt = options.deadlineAt ?? now() + ANALYSIS_DEADLINE_MS;
  const canStartGithub = remainingBudgetMs(deadlineAt, now) >= MIN_REQUEST_START_WINDOW_MS;
  const github = canStartGithub
    ? await loadContext(issueText, trace.relevantFrame, {
      ...options.githubOptions,
      deadlineAt: Math.min(deadlineAt, now() + GITHUB_STAGE_BUDGET_MS),
      now,
    })
    : {
      status: 'request-failed' as const,
      message: 'The analysis deadline was reached before GitHub lookup; source context was skipped.',
    };
  const sourceSnippet = github.status === 'ok' ? github.snippet : undefined;
  const hasGeminiWindow = remainingBudgetMs(deadlineAt, now) >= MIN_REQUEST_START_WINDOW_MS;
  const hintOptions = hasGeminiWindow
    ? { ...options.hintOptions, deadlineAt, now }
    : { ...options.hintOptions, apiKey: '', deadlineAt, now };
  const hints = await createHints(trace, sourceSnippet, hintOptions);

  return {
    status: 'ok',
    issueWarning: options.issueWarning,
    trace,
    github,
    hints,
  };
}
