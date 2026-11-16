## Current blockers

- `manifest.yml` now allows backend fetches only to `generativelanguage.googleapis.com` and `api.github.com`, and declares `read:jira-work` for issue/comment reads. YAML parsing and structural checks pass. `forge lint` still needs to be run from the authenticated PowerShell environment.
- Because egress and scope permissions changed, run `forge deploy --non-interactive --e development`, then `forge install --non-interactive --upgrade --site <site-url> --product jira --environment development` after Forge lint passes. No deploy or install was attempted in this task.
- The panel needs a manual test in Jira after deployment/upgrade, including an issue with a trace, a Jira hyperlink to a public GitHub repository, a no-trace issue, and the encrypted Gemini variable missing/rate-limited fallback.
- The Rovo Agent and reusable `action` module follow the current Forge docs. Whether the demo site exposes installed Rovo Agents cannot be verified from this local workspace; confirm Rovo availability after deployment.
- Dependency installation reported 19 audit findings (6 moderate, 13 high) in the resolved dependency tree. They have not been auto-fixed because that could upgrade unrelated Forge/UI dependencies; review the audit before release.
