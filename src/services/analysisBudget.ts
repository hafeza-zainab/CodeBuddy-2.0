/**
 * Keep the slowest supported resolver path comfortably below Forge's standard
 * interactive function runtime. The worst case is one issue read plus three
 * comment pages, four GitHub requests (404 + repo + tree + file), and two
 * Gemini attempts. Every timeout includes reading and decoding its response.
 */
export const FORGE_INTERACTIVE_RUNTIME_LIMIT_MS = 25_000;

export const ISSUE_REQUEST_TIMEOUT_MS = 1_200;
export const MAX_ISSUE_COMMENT_PAGES = 3;
export const GITHUB_REQUEST_TIMEOUT_MS = 1_200;
export const MAX_GITHUB_REQUESTS_PER_ANALYSIS = 4;
export const GEMINI_REQUEST_TIMEOUT_MS = 4_000;
export const GEMINI_MAX_ATTEMPTS = 2;
export const GEMINI_RETRY_DELAY_MS = 100;

export const MAX_SEQUENTIAL_NETWORK_BUDGET_MS = (
  (1 + MAX_ISSUE_COMMENT_PAGES) * ISSUE_REQUEST_TIMEOUT_MS
  + MAX_GITHUB_REQUESTS_PER_ANALYSIS * GITHUB_REQUEST_TIMEOUT_MS
  + GEMINI_MAX_ATTEMPTS * GEMINI_REQUEST_TIMEOUT_MS
  + GEMINI_RETRY_DELAY_MS
);
