# Security and permissions

CodeBuddy 2.0 requests the minimum manifest permissions needed for its current features. It does not request Jira write access, user profile access, storage scopes, or authenticated GitHub access.

## Jira scopes

| Scope | Why it is needed | Code path |
| --- | --- | --- |
| `read:jira-work` | Read the current issue description and comments so the parser can find stack traces and repository links. Requests run as the current Jira user, so Jira applies that user's issue permissions. | `src/frontend/index.jsx` uses `requestJira`; `src/services/loadIssueText.ts` reads `/rest/api/3/issue/{key}` and its comments. |

No other Jira scope is declared. The app does not create or update Jira content.

## Backend egress

| Host | Why it is needed | Code path |
| --- | --- | --- |
| `generativelanguage.googleapis.com` | Send bounded Gemini hint requests when the encrypted `GEMINI_API_KEY` is configured. Template hints remain available if the key or API is unavailable. | `src/hints/generateHints.ts` |
| `api.github.com` | Read one public repository file and, when the frame path does not match, perform a bounded repository/tree lookup. No GitHub token is sent. | `src/github/loadGithubContext.ts` |

These are the only hosts in the manifest's backend egress allowlist. The app makes no calls to paid services and adds no storage permission or cache.

## Secret handling

`GEMINI_API_KEY` must be configured as an encrypted Forge environment variable. It is sent only in the Gemini request header. The app does not place it in prompts, UI output, or logs. Never add the key or Forge credentials to source files, screenshots, issue fixtures, or commits.

## Data handling limits

Jira issue text is parsed in the frontend/backend analysis flow and sent to Gemini only when configured. A bounded source excerpt may also be sent to Gemini after public GitHub lookup. Gemini prompt size and request time are capped by the implementation. GitHub source retrieval is limited by a byte cap and a small line window. No persistent cache is used.
