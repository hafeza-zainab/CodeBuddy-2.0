# CodeBuddy 2.0 — submission material

## Devpost description

CodeBuddy 2.0 is a Jira issue panel for understanding Python, JavaScript/TypeScript, and Java stack traces. It reads an issue description and comments, selects an application frame, and presents three progressive hint levels: **Nudge** prompts the developer to reason about the failure, **Pointer** names the likely cause and frame, and **Full fix** provides an explanation and code example. If an issue contains a public GitHub repository link, the app tries to load the relevant source file and a small line window around the frame. Gemini can produce structured hints when configured; deterministic templates keep the analysis useful when Gemini is unavailable or returns unusable output.

The panel and the CodeBuddy 2.0 Rovo agent call the same analysis flow. A hint is guidance, not a guaranteed patch: templates are examples, and AI output depends on the trace and available source context.

## How the Forge requirement is met

This project is an installable Forge app declared in `manifest.yml`. Jira issue data is read as the current user through Forge Bridge, analysis runs in Forge resolver functions, and the interface uses Forge UI Kit. The manifest also declares a Rovo agent and reusable action. External requests run from the Forge backend and are restricted to Gemini and GitHub egress hosts; there is no separately hosted app server.

## Category and bonus prize

**Apps for Software Teams:** CodeBuddy puts stack-trace interpretation beside the Jira issue where a team reports a software defect. It helps a developer move from an error message to the relevant frame and a reasoned next step.

**Best Agents:** The manifest declares a CodeBuddy 2.0 Rovo agent that can call a reusable action. The action accepts a Jira issue key or pasted trace and delegates to the panel's shared analyzer, so both surfaces use the same parser, optional public-source lookup, and three hint levels. A site's Rovo availability and permissions must be confirmed by the judge; this repository cannot establish those tenant settings.

## Judge setup

Prerequisites: Node.js 24, npm, Forge CLI, a Jira Cloud site where you can install Forge apps, and app-owner access if deploying this repository. Gemini is optional; templates work without it. An install link is available only after the app owner enables sharing in Developer Console.

1. Use the install link supplied by the app owner: **[CodeBuddy 2.0 install link — owner to add]**. Select a Jira site and approve the displayed permissions. If there is no install link, ask the app owner to enable the correct sharing level and provide it.
2. For a source checkout, run `npm ci`, `npm run lint`, `npm run build`, `npm test`, then authenticate with Forge and follow [docs/DEPLOY.md](DEPLOY.md) to deploy/install your own environment.
3. Add a Python, JavaScript/TypeScript, or Java stack trace to a Jira issue description or comment. For repository context, include a public GitHub repository link in that issue text; frame file paths must correspond to a file in that repository.
4. Open the issue in Jira's new issue view. Use the issue's **•••** menu to open **CodeBuddy 2.0**; the panel appears above Activity. Review the three labeled hints and repository/hint source notes.
5. To try Rovo, open the Rovo agent picker and choose **CodeBuddy 2.0**. Provide an issue key or paste a trace. If the agent is absent, that site's Rovo availability or installation must be checked.

## Reused ideas vs new code

The read-only [old CodeBuddy reference](../codebuddy-reference) informed the staged hint levels, grounded explanations, and loading only relevant repository source. This app reimplements those ideas in TypeScript for Forge; it does not copy the Python/Streamlit code. The Jira panel, resolver flow, parser, GitHub API client, Gemini structured-output client, deterministic templates, Rovo integration, permission model, and UI are new code in this repository.
