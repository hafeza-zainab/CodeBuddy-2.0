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
// Rotate across Google models rather than spending the whole budget retrying one busy model.
// Google documents free standard-tier text input/output for all three model IDs below.
export const GEMINI_MODEL_CHAIN = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
] as const;
/** Allow operators to select and order only the model IDs already reviewed here. */
export function configuredGeminiModels(
  value: string | undefined = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.GEMINI_MODELS,
): string[] {
  const allowed = new Set<string>(GEMINI_MODEL_CHAIN);
  const configured = value?.split(',').map((model) => model.trim()).filter((model) => allowed.has(model)) ?? [];
  return [...new Set(configured.length ? configured : GEMINI_MODEL_CHAIN)];
}
export const GEMINI_REQUEST_TIMEOUT_MS = 2_200;
export const GEMINI_MAX_ATTEMPTS = GEMINI_MODEL_CHAIN.length;
export const GEMINI_RETRY_DELAY_MS = 350;

/** Worst-case phase budgets, including GitHub retry and Gemini model rotation. */
export const MAX_SEQUENTIAL_NETWORK_BUDGET_MS = (
  JIRA_STAGE_BUDGET_MS + GITHUB_STAGE_BUDGET_MS + GEMINI_STAGE_BUDGET_MS
);

export function remainingBudgetMs(deadlineAt: number, now: () => number = Date.now): number {
  return Math.max(0, deadlineAt - now());
}
