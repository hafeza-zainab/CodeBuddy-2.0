## Current blockers

- `manifest.yml` now allows backend fetches only to `generativelanguage.googleapis.com` and `api.github.com`, and declares `read:jira-work` for issue/comment reads. As requested, Forge lint still needs to be run by the user from the authenticated PowerShell environment.
- Because egress and scope permissions changed, run `forge deploy --non-interactive --e development`, then `forge install --non-interactive --upgrade --site <site-url> --product jira --environment development` after Forge lint passes. No deploy or install was attempted.
- The panel needs a manual test in Jira after deployment/upgrade, including a real issue with a trace, a GitHub link, the no-trace state, and template fallback.
- Rovo Agent/action code is being added using current manifest docs. Whether the demo site exposes installed Rovo Agents cannot be verified from this local workspace; check in Jira/Rovo after deployment.
- Dependency installation reported 18 audit findings (5 moderate, 13 high) in the resolved dependency tree. They have not been auto-fixed because that could upgrade unrelated Forge/UI dependencies; review the audit before release.
