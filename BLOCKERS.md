## Current blockers

- **Persistent Gemini hint cache is deferred.** Forge's `@forge/kvs` storage requires the `storage:app` scope. Adding it would require updating permissions and an installation upgrade approval, so no KVS dependency or scope was added. The requested cache test is therefore intentionally not included. Revisit if you want to approve that scope and upgrade the Jira installation.

- **Forge CLI authentication is unavailable in the Codex shell.** `FORGE_EMAIL` and `FORGE_API_TOKEN` are absent here. `forge install list --verbose --json` and `forge lint --verbose` fail while accessing the local credential vault with: `Keytar error detected: Access is denied.` The CLI also reports: `Failed to fetch Forge dynamic configurations. Some preview features may be unavailable. Rerun the command to retry.` Deployment and installation upgrade have not been run from this shell.
- Run these commands in the authenticated Administrator PowerShell session from the app root:

  ```powershell
  git pull
  forge install list
  forge lint
  forge deploy --non-interactive --e development
  forge install --non-interactive --upgrade --site one-atlas-vvoi.atlassian.net --product jira --environment development
  ```

- Local checks pass: `npm test` (107 tests), `npx tsc --noEmit`, `npm run lint`, and `npm run build`. The manifest declares one scope (`read:jira-work`) and backend egress only to `generativelanguage.googleapis.com` and `api.github.com`. Forge lint/deploy/upgrade remain pending in the authenticated Administrator PowerShell session.
- In the Jira UI on `one-atlas-vvoi.atlassian.net`, the Rovo picker shows and selects **CodeBuddy 2.0**. A synthetic Python test issue with a deliberately invalid repository link was created as `TD-1` in the **Tally Dev** project on that same site. The CodeBuddy issue panel did not appear on that issue before a verified deployment/upgrade.
- After deployment/upgrade, check the panel on a new-view Jira issue that the signed-in test user can edit. The current Forge docs say the panel button appears in the issue view menu (often the `•••` menu), and the panel content opens above Activity after the button is clicked. The module does not work in Jira's old issue view. If the button is absent, confirm the test user's Edit issue permission and that the issue is open in the new view before investigating logs or the manifest.
- Manual app-panel tests for Python, JavaScript, Java, no trace, bad repository handling, and a deliberately invalid `GEMINI_API_KEY` remain pending. Do not change the configured Gemini variable in the live environment without a way to restore the valid value; use a temporary Forge environment or arrange restoration first.
- Dependency installation reported 19 audit findings (6 moderate, 13 high) in the resolved dependency tree. They have not been auto-fixed because that could upgrade unrelated Forge/UI dependencies; review the audit before release.

## Production and submission follow-up

- Production deployment has not been run from this workspace. An authenticated app-owner session must complete the commands and site checks in [docs/PRODUCTION.md](docs/PRODUCTION.md), including setting the optional encrypted production `GEMINI_API_KEY`, deploying production, enabling distribution and copying the install link in Developer Console, then verifying installation and the panel from a second Jira admin account.

## Follow-up hardening session (2026-11-26)

- Hint fallback now reads optional `GEMINI_MODELS` as a comma-separated ordered subset of the three code-reviewed defaults. Unknown model IDs are ignored; if none remain, defaults are used. A successful model or template fallback is logged without secrets. Invalid/missing structured JSON advances to the next configured model before templates are used.
- Parser, GitHub, and Rovo mocked coverage was expanded. The full local suite passes with 107 tests; TypeScript typecheck, ESLint, and build all pass.
- `forge lint` was attempted in this shell from `C:\dev\CodeBuddy-forge`; it produced no output for over 60 seconds and was interrupted. Prior Forge CLI attempts in this shell reported unavailable credentials/local-vault access. This is not a successful Forge manifest validation. Run `forge lint` from the authenticated Administrator PowerShell session before deploying.
- No Forge deploy/install, browser, or live Jira test was performed. Run [docs/DEPLOY.md](docs/DEPLOY.md) in an authenticated app-owner session, then use [docs/TEST-CHECKLIST.md](docs/TEST-CHECKLIST.md) for the live Jira and second-account checks.
- The happy-path test checklist uses the public CodeBuddy repository path `src/parser/parseStackTrace.ts`; verify the repository is public and the frame path still exists before testing. The code can fall back by basename, but cannot disambiguate branch names containing slashes in GitHub tree/blob URLs; this limitation is documented in README.
- The optional cache remains deferred. No `storage:app` scope or persistent cache is present.
- The user must confirm production Jira panel behavior with a real trace, missing trace, and unavailable public repository. Confirm Rovo availability/response on the target site if the Best Agents submission is pursued. No browser or Forge CLI validation was performed for this documentation work.
