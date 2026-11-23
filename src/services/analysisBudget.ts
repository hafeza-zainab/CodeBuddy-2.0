/**
 * Synchronous Forge UI/resolver invocations have a 25 second hard limit.
 * Keep the user-visible analysis to 20 seconds: Jira 6s + GitHub 5s + Gemini
 * 8s leaves about 1s of budget slack, plus 5s before Forge's hard stop.
 */
export const FORGE_SYNCHRONOUS_RUNTIME_LIMIT_MS = 25_000;
export const ANALYSIS_DEADLINE_MS = 20_000;
export const ANALYSIS_DEADLINE_SLACK_MS = 1_000;
export const MIN_REQUEST_START_WINDOW_MS = 100;
export const MIN_CONFIGURED_TIMEOUT_MS = 1;

// Jira's issue and comment reads share a six-second phase budget, including retries.
export const JIRA_STAGE_BUDGET_MS = 6_000;
export const JIRA_REQUEST_TIMEOUT_MS = 2_500;
export const JIRA_MAX_ATTEMPTS = 2;
export const MAX_ISSUE_COMMENT_PAGES = 3;

// GitHub lookups (including path resolution) share five seconds; only timeouts retry.
export const GITHUB_STAGE_BUDGET_MS = 5_000;
export const GITHUB_REQUEST_TIMEOUT_MS = 2_500;
export const GITHUB_MAX_ATTEMPTS = 2;

// Gemini gets at most eight seconds total; each attempt is bounded to four seconds.
export const GEMINI_STAGE_BUDGET_MS = 8_000;
export const GEMINI_REQUEST_TIMEOUT_MS = 4_000;
export const GEMINI_MAX_ATTEMPTS = 2;
export const GEMINI_RETRY_DELAY_MS = 100;

/** Worst-case phase budgets, including the single retry in each remote phase. */
export const MAX_SEQUENTIAL_NETWORK_BUDGET_MS = (
  JIRA_STAGE_BUDGET_MS + GITHUB_STAGE_BUDGET_MS + GEMINI_STAGE_BUDGET_MS
);

export function remainingBudgetMs(deadlineAt: number, now: () => number = Date.now): number {
  return Math.max(0, deadlineAt - now());
}
