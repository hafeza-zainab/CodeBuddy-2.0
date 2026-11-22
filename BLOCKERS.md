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

- Local checks pass: `npm run lint`, `npm run build`, and `npm test` (49 tests). The working tree is current with the remote.
- In the Jira UI on `one-atlas-vvoi.atlassian.net`, the Rovo picker shows and selects **CodeBuddy 2.0**. A synthetic Python test issue with a deliberately invalid repository link was created as `TD-1` in the **Tally Dev** project on that same site. The CodeBuddy issue panel did not appear on that issue before a verified deployment/upgrade.
- Manual app-panel tests for Python, JavaScript, Java, no trace, bad repository handling, and a deliberately invalid `GEMINI_API_KEY` remain pending. Do not change the configured Gemini variable in the live environment without a way to restore the valid value; use a temporary Forge environment or arrange restoration first.
- Dependency installation reported 19 audit findings (6 moderate, 13 high) in the resolved dependency tree. They have not been auto-fixed because that could upgrade unrelated Forge/UI dependencies; review the audit before release.
