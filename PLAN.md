# CodeBuddy 2.0 implementation plan

- [x] **1. Document the template**
  - Acceptance criteria: describe the existing Forge Jira issue-panel scaffold, its manifest modules, frontend/resolver entry points, and local validation commands; document the CodeBuddy 2.0 product flow and clearly separate reused ideas from new TypeScript/Forge code.
- [x] **2. Stack-trace parser (Python, JS/TS, Java) with tests**
  - Acceptance criteria: parse error type, message, and frames (file, line, function) from realistic Python, Node/browser JS/TS, and Java traces, including noisy/partial Jira text and chained causes; select a relevant application frame; return `null` for non-traces; unit tests cover at least five realistic cases per language.
- [x] **3. Hint engine + template fallback**
  - Acceptance criteria: return nudge, pointer, and full fix from trace plus optional source; mark source as AI or template; Gemini uses the encrypted Forge variable, bounded timeout and one retry; deterministic fallback covers at least 15 common errors across the supported languages; HTTP is mocked in tests and secrets are never logged.
- [x] **4. GitHub repo context with size and rate-limit handling**
  - Acceptance criteria: find a public GitHub repository URL in issue text, fetch only the selected frame's source via GitHub API, trim to about 60 lines around the failing line, enforce a size cap, handle absent/private/missing/path mismatch/rate-limit/no-token cases without crashing, and mock HTTP in tests.
- [x] **5. Jira panel wired to the resolver**
  - Acceptance criteria: use issue context dynamically, call the resolver with issue content and display all three hint levels plus source/status; keep permissions minimal and verify the manifest with Forge lint.
  - Implementation and local verification are complete; Forge lint and live Jira testing remain manual checks recorded in `BLOCKERS.md`.
- [x] **5b. Rovo agent + reusable action**
  - Acceptance criteria: add a manifest-valid `rovo:action` accepting an issue key or pasted trace and returning three hints, plus an agent that uses it; verify module syntax against current Forge docs and record any site eligibility/install dependency in `BLOCKERS.md`.
- [x] **6. Loading, error and “no stack trace found” states**
  - Acceptance criteria: panel clearly handles loading, resolver/GitHub/Gemini failures, and missing traces while still showing useful template fallback output when possible.
- [x] **7. Setup, testing and demo-script docs**
  - Acceptance criteria: README lets a stranger set up and validate the app in under 10 minutes; includes “Reused ideas vs new code” crediting the old CodeBuddy, explains how the Forge requirement is met, and contains a real-input Jira demo script under five minutes. `docs/SUBMISSION.md` provides Devpost-ready description, category/Best Agents rationale, judge setup, and a sub-4:30 real-input Jira video script; `docs/DEPLOY.md` documents production deploy, encrypted Gemini setup, install-link creation, second-account verification, and least permissions. No secrets are documented or committed.

## Follow-up hardening requested 2026-11-26

- [x] **1. Hint engine hardening** — `GEMINI_MODELS` selects/orders only reviewed default IDs; invalid structured output advances to the next model; diagnostics omit secrets; prose sanitizer strips Markdown markers while code remains separate. Tests cover configuration and tricky model output.
- [x] **2. Parser coverage** — tests cover Python/JS/TS/Java frames, chained causes, ADF code/plain text/comments, Windows paths, very long/minified input, and clean null for unrecognized text.
- [x] **3. GitHub context** — mocked tests cover public-repo success, ADF/smart-link preservation, trailing slash, `.git`, tree/blob branch URLs, 404/403/rate limits, safe oversized-prefix truncation, and trace-only hints without usable context.
- [x] **4. Panel states** — loading, no-trace, friendly read error, repository unavailable, template fallback, success, and three labeled hint levels are present; raw resolver errors are not rendered.
- [x] **5. Rovo** — prompt requests issue/trace input when missing and describes all three levels; action tests cover valid issue, no trace, bad repo, and Gemini fallback.
- [x] **6. Scope review** — `docs/SECURITY.md` justifies the only Jira scope and both backend egress hosts; no new scopes or cache added.
- [x] **7. Docs** — README, submission, demo, manual test checklist, and deployment docs updated to match implementation and limitations.
- [x] **8. Final checks and push** — `npm test` (107 passed), `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. Forge lint was attempted but produced no output and stalled in this shell; see `BLOCKERS.md`. All commits are being pushed to `origin/main` at the end of this session.
