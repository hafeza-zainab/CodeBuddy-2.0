# CodeBuddy 2.0 — submission material

## Devpost-ready description

CodeBuddy 2.0 brings stack-trace tutoring into Jira. Open an issue panel on an issue containing a Python, JavaScript/TypeScript, or Java error and get three progressive hints: a nudge to guide your reasoning, a pointer to the relevant file and line, and a concrete full fix. When the issue links a public GitHub repository, CodeBuddy can fetch a small source window around the selected frame to ground the explanation. Gemini can improve the hints when configured; bounded requests and deterministic templates keep the experience useful when Gemini is unavailable or rate-limited. A Rovo agent can analyze the current issue, an issue key, or a pasted trace through the same reusable action.

The app is intended to help developers understand and investigate errors, not to claim that a suggested fix is guaranteed correct. Source and model availability are reported by the app.

## How the Forge requirement is met

CodeBuddy 2.0 is implemented as an Atlassian Forge app, declared in `manifest.yml` and installed into Jira Cloud. Its issue panel is rendered with Forge UI Kit (`@forge/react`), Jira data is accessed through the Forge bridge, and analysis runs through Forge resolver functions. The optional Rovo agent and reusable action are Forge modules as well. Gemini and GitHub requests are made from the Forge backend under the manifest's explicit egress allowlist; the app does not rely on a separately hosted web service.

## Category and bonus prize

**Apps for Software Teams:** CodeBuddy places stack-trace triage alongside the Jira issue where a software team reports and discusses a bug. It helps teammates move from an error message toward relevant source and a reasoned correction.

**Best Agents:** The CodeBuddy 2.0 Rovo agent is paired with a reusable Forge action that invokes the same analyzer as the issue panel. Its instructions explain the nudge, pointer, and full-fix levels, request a trace or issue when context is missing, and tell it not to invent project-specific details. Rovo availability and behavior still depend on the target site's capabilities and must be confirmed there.

## Judge setup (under 10 minutes with prerequisites ready)

Prerequisites: Node.js 24, npm, Forge CLI authenticated to an Atlassian account, and a Jira Cloud site where that account can install apps. A Gemini key is optional; the template fallback works without it. Allow around 5–8 minutes if the prerequisites and site are already available.

1. Clone the repository and enter it:

   ```powershell
   git clone https://github.com/hafeza-zainab/CodeBuddy-2.0.git
   cd CodeBuddy-2.0
   ```

2. Install dependencies and run the local checks:

   ```powershell
   npm ci
   npm run lint
   npm run build
   npm test
   forge lint
   ```

3. Deploy and install the development environment (substitute your Jira site URL):

   ```powershell
   forge deploy --non-interactive --e development
   forge install --non-interactive --site YOUR-SITE.atlassian.net --product jira --environment development
   ```

4. Open a Jira issue in the new issue view as a user who can edit it. Use the issue's `•••` menu to open **CodeBuddy 2.0**; the panel opens above Activity. Provide a real trace in the issue description or comments. A public GitHub repository link is optional. If a Gemini key is configured in the development environment, it is used; otherwise the deterministic template hints are returned.

5. If the site exposes Rovo agents, open the CodeBuddy 2.0 agent and provide the issue key or paste a trace. Rovo support and access can vary by site and plan.

## Demo video script (about 4 minutes; maximum 4:30)

Use a Jira issue with a real, non-sensitive stack trace and, if available, a public repository link. Do not show secrets or personal data. Use voice narration or silence; do not add copyrighted music.

- **0:00–0:25 — Introduce the problem.** Show the Jira issue and explain that stack traces can be difficult to interpret when you are learning a codebase.
- **0:25–0:55 — Open the app.** Open CodeBuddy 2.0 from the issue menu and show the detected language/error and repository-context status.
- **0:55–2:25 — Walk through the hints.** Read the nudge as a reasoning prompt, the pointer as the location and likely mistake, and the full fix as a concrete correction. Show whether the response source is Gemini or templates. If GitHub context is absent, explain the visible status rather than implying source was fetched.
- **2:25–2:55 — Show a missing-input state.** Open a Jira issue with no supported stack trace and show the app's no-trace message. Do not imply that the panel can infer a trace that is not present.
- **2:55–3:45 — Show the Rovo experience, if available.** Ask the CodeBuddy 2.0 agent to analyze an issue or paste the same kind of trace. Show how it presents the three levels and asks for input when needed. If the site's Rovo capability is unavailable, use this time to explain the reusable action based on the shipped manifest and code, without presenting an unrun interaction as live.
- **3:45–4:10 — Close.** Summarize that CodeBuddy connects issue context, optional public source context, and progressive hints in a Forge app. Leave the remaining time for a short end card; total runtime must stay below 4:30.

## Reused ideas vs new code

The read-only [old CodeBuddy reference](../codebuddy-reference) informed the progressive hint levels, the preference for grounded explanations, and loading only relevant repository source. CodeBuddy 2.0 reimplements those ideas in TypeScript for Forge; it does not copy the Python/Streamlit implementation. The Jira panel, resolver and Rovo integrations, cross-language parser, GitHub loader, fallback catalog, permission model, and UI are new code in this repository.
