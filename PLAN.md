# CodeBuddy 2.0 implementation plan

- [x] **1. Document the template**
  - Acceptance criteria: describe the existing Forge Jira issue-panel scaffold, its manifest modules, frontend/resolver entry points, and local validation commands; document the CodeBuddy 2.0 product flow and clearly separate reused ideas from new TypeScript/Forge code.
- [x] **2. Stack-trace parser (Python, JS/TS, Java) with tests**
  - Acceptance criteria: parse error type, message, and frames (file, line, function) from realistic Python, Node/browser JS/TS, and Java traces, including noisy/partial Jira text and chained causes; select a relevant application frame; return `null` for non-traces; unit tests cover at least five realistic cases per language.
- [x] **3. Hint engine + template fallback**
  - Acceptance criteria: return nudge, pointer, and full fix from trace plus optional source; mark source as AI or template; Gemini uses the encrypted Forge variable, bounded timeout and one retry; deterministic fallback covers at least 15 common errors across the supported languages; HTTP is mocked in tests and secrets are never logged.
- [x] **4. GitHub repo context with size and rate-limit handling**
  - Acceptance criteria: find a public GitHub repository URL in issue text, fetch only the selected frame's source via GitHub API, trim to about 60 lines around the failing line, enforce a size cap, handle absent/private/missing/path mismatch/rate-limit/no-token cases without crashing, and mock HTTP in tests.
- [ ] **5. Jira panel wired to the resolver**
  - Acceptance criteria: use issue context dynamically, call the resolver with issue content and display all three hint levels plus source/status; keep permissions minimal and verify the manifest with Forge lint.
  - Implementation is complete; Forge lint remains a user-run check recorded in `BLOCKERS.md`.
- [x] **5b. Rovo agent + reusable action**
  - Acceptance criteria: add a manifest-valid `rovo:action` accepting an issue key or pasted trace and returning three hints, plus an agent that uses it; verify module syntax against current Forge docs and record any site eligibility/install dependency in `BLOCKERS.md`.
- [x] **6. Loading, error and “no stack trace found” states**
  - Acceptance criteria: panel clearly handles loading, resolver/GitHub/Gemini failures, and missing traces while still showing useful template fallback output when possible.
- [ ] **7. Setup, testing and demo-script docs**
  - Acceptance criteria: README lets a stranger set up and validate the app in under 10 minutes; includes “Reused ideas vs new code” crediting the old CodeBuddy, explains how the Forge requirement is met, and contains a real-input Jira demo script under five minutes; no secrets are documented or committed.
