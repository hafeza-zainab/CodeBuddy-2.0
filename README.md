# CodeBuddy 2.0 for Jira

CodeBuddy 2.0 is a Jira issue panel that helps beginners understand application errors. It reads the current issue's description and comments, recognizes Python, JavaScript/TypeScript, and Java stack traces, and returns three progressive hints: a nudge, a file-and-line pointer, and a full fix. When the issue links a public GitHub repository, it fetches a bounded window from the relevant file. Gemini is optional; deterministic templates still provide useful hints when Gemini is unavailable, rate-limited, or not configured.

## Current implementation

- The Forge app key remains `codebuddy-forge`; “CodeBuddy 2.0” is its product display name.
- `manifest.yml` declares the Jira issue panel, the Forge `action` module used by the Rovo agent, resolver functions, `read:jira-work`, and backend egress to only `generativelanguage.googleapis.com` and `api.github.com`. Forge's module key is `action`; the Rovo agent references the action by its key.
- `src/frontend/index.jsx` uses UI Kit issue context and the Forge bridge to load Jira text as the current user and render loading, error, no-trace, source-status, and hint states.
- `src/services/loadIssueText.ts` reads the issue description and paginates comments; `src/services/analyzeIssue.ts` coordinates the shared parser, GitHub context, and hint modules.
- `src/parser/parseStackTrace.ts`, `src/github/loadGithubContext.ts`, and `src/hints/generateHints.ts` implement language parsing, bounded public source lookup, and Gemini/template hints.
- `src/rovo/rovoAction.ts` adapts an issue key or pasted trace to the same analyzer used by the panel.

## Setup

Prerequisites: Node.js 24, npm, an Atlassian developer site with Jira, and Forge CLI access. A first-time setup generally takes less than 10 minutes when Forge is already installed and the developer site is ready.

```powershell
git clone https://github.com/hafeza-zainab/CodeBuddy-2.0.git
cd CodeBuddy-2.0
npm install
npm run lint
npm run build
npm test
forge login
forge lint
```

If Forge reports `Not logged in` or `Credentials Vault: Access is denied` because credentials are unavailable to the current shell, set `FORGE_EMAIL` and `FORGE_API_TOKEN` in the same PowerShell session before running Forge commands. Use an Atlassian API scoped token with Forge access. With these environment variables set, the CLI uses them directly; do not also run `forge login`. See [Forge environment-variable login](https://developer.atlassian.com/platform/forge/getting-started/#using-environment-variables-to-login).

Set `GEMINI_API_KEY` as an encrypted Forge environment variable. Run the command without a value so the CLI prompts for it:

```powershell
forge variables set --encrypt --environment development GEMINI_API_KEY
```

Forge encrypts the variable at rest. Redeploy after changing it for the runtime to receive the new value. Keep it out of source files, shell history, screenshots, logs, and commits. Without the variable, the app uses its template fallback. See [Forge CLI variables](https://developer.atlassian.com/platform/forge/cli-reference/variables/) and [encrypted variable setup](https://developer.atlassian.com/platform/forge/cli-reference/variables-set/).

The manifest now requests Jira read scope and two external fetch hosts. After `forge lint` succeeds, deploy to development and upgrade the existing installation so the new scope and egress permissions take effect:

```powershell
forge deploy --non-interactive --e development
forge install --non-interactive --upgrade --site one-atlas-vvoi.atlassian.net --product jira --environment development
```

The issue panel uses current-user Jira access, so the viewer must have permission to browse the issue. The app reads descriptions and comments only; it does not edit Jira issues.

## Development and tests

Run these from the repository root after each implementation step:

```powershell
npm run lint
npm run build
npm test
```

The Node test runner covers the parser, template and Gemini request behavior, GitHub API responses, Jira text loading, shared analysis, and Rovo action inputs. Network dependencies are mocked in tests. `npm run build` syntax-checks the Forge entry points and JSX and type-checks the TypeScript service modules. Run `forge lint` after every manifest change. The current login, deployment, upgrade, and Jira test status is tracked in `BLOCKERS.md`.

## Reused ideas vs new code

The read-only [old CodeBuddy reference](../codebuddy-reference) informed the staged hint levels, the instruction to say when source and trace do not match instead of inventing details, and the approach of loading only relevant repository source. CodeBuddy 2.0 reimplements those ideas in TypeScript for Forge; it does not copy the Python/Streamlit implementation. The Jira panel, resolver and Rovo integrations, cross-language parser, GitHub loader, template catalog, permission model, and UI are new code in this repository.

## How the Forge requirement is met

CodeBuddy 2.0 is an installable Atlassian Forge Cloud app. The manifest declares a Jira issue panel rendered with `@forge/react`, Forge resolver functions, and a Rovo agent/action. Jira reads use the Forge bridge as the current user; Gemini and GitHub requests run in a Forge function under the declared backend egress allowlist. The project uses the Forge CLI to lint, deploy, and install the app.

## Demo script (about 3 minutes)

Use a real Jira issue on the demo site that contains a Python, JS/TS, or Java stack trace and a public GitHub repository link. Do not use an issue containing secrets or personal data.

1. Open the issue and launch the **CodeBuddy 2.0** issue panel. Show the issue key and the error type the panel found.
2. Show the repository status and fetched file window, or explain the clear status if the repository is unavailable.
3. Read the nudge, then the file-and-line pointer, then the full fix. Point out whether the result came from Gemini or the local template fallback.
4. Open an issue with no supported trace and show the no-trace state. If time permits, temporarily use an issue without a repository link to show hints still work without GitHub context.
5. In Rovo chat, ask the CodeBuddy 2.0 agent to analyze a Jira issue or paste a trace. Show that it uses the reusable action and presents the same three levels.

## Remaining manual checks

See [BLOCKERS.md](BLOCKERS.md) for Forge lint, deployment/installation upgrade, Jira panel testing, and whether the demo site exposes the Rovo agent.
