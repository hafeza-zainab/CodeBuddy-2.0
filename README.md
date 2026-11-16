# CodeBuddy 2.0 for Jira

CodeBuddy 2.0 is a Jira issue panel for beginners debugging application errors. Its planned flow reads an issue's description and comments, detects Python, JavaScript/TypeScript, or Java stack traces, and offers three levels of help: a nudge, a file-and-line pointer, and a full fix. When an issue links a public GitHub repository, the app can use a small source window around the relevant frame. Gemini is optional; deterministic templates must still give useful hints when the free model is unavailable or rate-limited.

## Current template

This repository started from Forge's Jira issue panel UI Kit scaffold:

- `manifest.yml` declares one `jira:issuePanel` module, a `main` UI resource, and a resolver function.
- `src/frontend/index.jsx` is the UI Kit panel entry point. It currently invokes `getText` and displays the scaffold's greeting.
- `src/resolvers/index.js` defines the `getText` resolver. It currently logs the resolver request and returns a greeting; remove that logging as the real resolver is implemented.
- `src/index.js` exports the resolver handler used by the manifest.
- The app's Forge key remains `codebuddy-forge`; “CodeBuddy 2.0” is the product display name used in user-facing documentation.

## Architecture and status

The intended runtime path is Jira issue panel → Forge resolver → stack-trace parser → optional public GitHub context → Gemini hint generation with deterministic template fallback → three hints rendered in the panel. Parsing, repository loading, and hint generation will remain separate so they can be tested without a Jira site or external network calls.

The app currently contains only the hello-world template. Follow [PLAN.md](PLAN.md) for implementation status and [BLOCKERS.md](BLOCKERS.md) for work that needs account access or a user action.

## Reused ideas vs new code

The read-only [old CodeBuddy reference](../codebuddy-reference) informed the staged hint levels, the rule to avoid inventing an explanation when the trace and source do not match, and the approach of fetching only relevant source context. This Forge app reimplements those ideas in TypeScript for Jira; it does not copy the Python/Streamlit implementation. The Jira issue panel, resolver flow, cross-language trace parser, Forge permissions, and UI are new code for this repository.

## How this meets the Forge requirement

The product is delivered as an Atlassian Forge app: `manifest.yml` declares a Jira issue panel and Forge resolver, while the panel uses `@forge/react` UI Kit and Forge bridge invocation. The app is already deployed and installed on the demo site. Changes to manifest permissions require a deployment and, when scopes or egress change, an installation upgrade; do that only after the required Forge CLI access is available.

## Development and checks

Use Node.js and npm from the repository root:

```powershell
npm install
npm run lint
npm run build
npm test
```

`npm run build` currently performs JavaScript syntax checks for the template entry points. `npm test` uses Node's built-in test runner; tests will be added with the parser and service modules. Validate Forge manifest changes with `forge lint` from this directory. The Forge CLI currently needs an authenticated session on the development machine; see `BLOCKERS.md`.

The encrypted Forge variable `GEMINI_API_KEY` is used only by the backend. Never put it in source files, documentation, frontend code, or logs. The GitHub API path must work for public repositories without a token and show a useful rate-limit status when unauthenticated quota is exhausted.

## Demo

The planned demo is a short run in the installed Jira issue panel using a real issue with a stack trace and a linked public GitHub repository. Show the nudge first, then pointer and full fix, and include a no-trace or fallback case. The final step will add a timed script once the live flow is implemented.
