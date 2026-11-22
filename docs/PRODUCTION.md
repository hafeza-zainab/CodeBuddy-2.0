# Production readiness checklist

These steps deploy CodeBuddy 2.0 to Forge's production environment. Run them from the repository root in an authenticated PowerShell session using the app owner's Forge account. This document does not mean production deployment or marketplace/distribution approval has already happened.

## 1. Validate and deploy

Run local checks, then validate the Forge manifest and deploy:

```powershell
npm ci
npm run lint
npm run build
npm test
forge lint
forge deploy -e production
```

The app currently requests the Jira `read:jira-work` scope and backend egress only to `generativelanguage.googleapis.com` and `api.github.com`. Review the permission prompt/output and stop to review any unexpected permission change before approval. No extra Jira write scopes are needed for the current read-only workflow.

## 2. Set the encrypted production Gemini key (optional)

Gemini is optional: without a configured production value, the deterministic hint templates remain available. To configure it without placing the key in shell history, run the command with the key omitted so Forge CLI prompts for the key:

```powershell
forge variables set --encrypt --environment production GEMINI_API_KEY
forge deploy -e production
```

Enter the key only at the hidden prompt. Do not paste it into a command, repository file, ticket, log, screenshot, or chat. Forge variables are environment-specific, so a development key does not configure production. Redeploy after setting the variable for the deployed runtime to receive it.

## 3. Create an install link

The current Forge distribution flow creates/copies the install link in the Atlassian Developer Console rather than with a Forge CLI command:

1. Open the app in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Choose **Distribution** and enable the appropriate sharing option for the intended audience.
3. Select Jira as the supported product, save the distribution settings, and copy the installation link shown there.
4. Share that link with the tester. Anyone installing the app must be a Jira site administrator for the target site. Review the requested app permissions in the install flow.

The app must be deployed to production before distributing that production version. Enabling sharing and creating/copying a link requires an account with appropriate app-owner access in the Developer Console.

## 4. Verify with a second account

1. Use a separate Atlassian account that is a Jira administrator on a test site; do not use the app owner's already-installed session as the only verification.
2. Open the production install link, choose the test Jira site, review the requested permissions, and install CodeBuddy 2.0.
3. As a user who can edit an issue, open a new-view Jira issue containing a non-sensitive real Python, JS/TS, or Java trace. Open **CodeBuddy 2.0** from the issue menu and confirm the loading state resolves to the three hint levels and a source label.
4. Also check an issue with no trace and one with a public repository link that is unavailable or invalid. Confirm the app displays a useful no-trace/source status and does not fail the whole analysis.
5. If Rovo is in scope for the site, confirm the agent is available, ask it to analyze the issue, and verify it explains all three hint levels. If Rovo is unavailable, record that site/plan limitation; do not treat it as a successful live check.

Record the production deployment/version, target site, second-account install result, panel checks, Rovo availability, and any failures in `BLOCKERS.md` or the release notes. Never include credentials or the Gemini key in that record.

## Scope and egress review

Keep `read:jira-work` while the app only reads descriptions/comments through the current user's Jira access. Keep backend egress limited to the Gemini Generative Language API and GitHub API, which supply optional hint generation and public source context. Reassess the permissions only if implementation adds a new product API or external service; do not add broad wildcards.

## Official Forge references

- [Deploy a Forge app to production](https://developer.atlassian.com/platform/forge/staging-and-production-apps/)
- [Set Forge environment variables](https://developer.atlassian.com/platform/forge/cli-reference/variables-set/)
- [Distribute Forge apps and create an installation link](https://developer.atlassian.com/platform/forge/distribute-your-apps/)
