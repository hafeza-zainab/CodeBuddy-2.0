## Current blockers

- **Forge CLI authentication is unavailable in the Codex shell.** `FORGE_EMAIL` and `FORGE_API_TOKEN` are absent here. `forge install list --verbose --json` and `forge lint --verbose` fail while accessing the local credential vault with: `Keytar error detected: Access is denied.` The CLI also reports: `Failed to fetch Forge dynamic configurations. Some preview features may be unavailable. Rerun the command to retry.` Deployment and installation upgrade have not been run from this shell.
- Run these commands in the authenticated Administrator PowerShell session from the app root:

  ```powershell
  git pull
  forge install list
  forge lint
  forge deploy --non-interactive --e development
  forge install --non-interactive --upgrade --site one-atlas-vvoi.atlassian.net --product jira --environment development
  ```

- Local checks pass: `npm run lint`, `npm run build`, and `npm test` (63 tests). Manifest YAML parses locally and contains the Jira panel, action, and Rovo agent modules. Forge lint/deploy/upgrade remain pending in the authenticated Administrator PowerShell session.
- In the Jira UI on `one-atlas-vvoi.atlassian.net`, the Rovo picker shows and selects **CodeBuddy 2.0**. A synthetic Python test issue with a deliberately invalid repository link was created as `TD-1` in the **Tally Dev** project on that same site. The CodeBuddy issue panel did not appear on that issue before a verified deployment/upgrade.
- After deployment/upgrade, check the panel on a new-view Jira issue that the signed-in test user can edit. The current Forge docs say the panel button appears in the issue view menu (often the `•••` menu), and the panel content opens above Activity after the button is clicked. The module does not work in Jira's old issue view. If the button is absent, confirm the test user's Edit issue permission and that the issue is open in the new view before investigating logs or the manifest.
- Manual app-panel tests for Python, JavaScript, Java, no trace, bad repository handling, and a deliberately invalid `GEMINI_API_KEY` remain pending. Do not change the configured Gemini variable in the live environment without a way to restore the valid value; use a temporary Forge environment or arrange restoration first.
- Dependency installation reported 19 audit findings (6 moderate, 13 high) in the resolved dependency tree. They have not been auto-fixed because that could upgrade unrelated Forge/UI dependencies; review the audit before release.

## Production and submission follow-up

- Production deployment has not been run from this workspace. An authenticated app-owner session must complete the commands and site checks in [docs/PRODUCTION.md](docs/PRODUCTION.md), including setting the optional encrypted production `GEMINI_API_KEY`, deploying production, enabling distribution and copying the install link in Developer Console, then verifying installation and the panel from a second Jira admin account.
- The user must confirm production Jira panel behavior with a real trace, missing trace, and unavailable public repository. Confirm Rovo availability/response on the target site if the Best Agents submission is pursued. No browser or Forge CLI validation was performed for this documentation work.
