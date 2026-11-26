# Forge deployment and distribution

Run commands from the Forge app root in an authenticated PowerShell session. Do not put a key or token in a command argument. `forge variables set --encrypt` prompts for the secret. Forge environment variables are separate per environment and take effect only after redeployment ([Forge variable command](https://developer.atlassian.com/platform/forge/cli-reference/variables-set/), [Forge deploy command](https://developer.atlassian.com/platform/forge/cli-reference/deploy/)).

## Development redeploy

```powershell
git pull
npm ci
npm run lint
npx tsc --noEmit
npm run build
npm test
forge lint
forge deploy --non-interactive -e development
forge install --non-interactive --upgrade --site one-atlas-vvoi.atlassian.net --product jira --environment development
```

If the app is not already installed on that site, use `forge install --non-interactive --site one-atlas-vvoi.atlassian.net --product jira --environment development` without `--upgrade`.

## Production key and deploy

First set the encrypted production key. The CLI prompts for the key; do not paste it into a command line or commit it:

```powershell
forge variables set --encrypt --environment production GEMINI_API_KEY
```

Then lint, deploy, and upgrade the existing production installation:

```powershell
forge lint
forge deploy --non-interactive -e production
forge install --non-interactive --upgrade --site YOUR-SITE.atlassian.net --product jira --environment production
```

For a first installation on a site, omit `--upgrade`:

```powershell
forge install --non-interactive --site YOUR-SITE.atlassian.net --product jira --environment production
```

If no production Gemini key is intended, skip the variables command; deterministic templates still work. The currently declared Jira scope is `read:jira-work`; no storage scope or additional egress is required. If a future change alters permissions, review the install approval screen and complete the required installation upgrade.

## Create an install link

Forge's install link is created in Developer Console, not with a CLI command. Atlassian's current distribution workflow is documented at [Distribute your apps](https://developer.atlassian.com/platform/forge/distribute-your-apps/):

1. Deploy the app to `production` first.
2. Open [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/) and select the **CodeBuddy-forge** app.
3. Open **Distribution** and edit **Distribution controls**.
4. Choose **Sharing within organization** for same-organization judges, or **Sharing** if judges are outside the owner's organization. Complete the requested listing/details and select Jira as the product.
5. Save, copy the generated installation link, and replace the placeholder in `README.md` and `docs/SUBMISSION.md` if it is meant to be public.

An install link can be used by a site admin to install the production app. Do not claim the link is active until sharing is enabled and the link is verified.

## Verify from a second account

1. Sign in as a second Atlassian account that can administer the target Jira site and has access to a test issue.
2. Open the install link, choose the intended site/Jira product, and review/approve the declared permissions.
3. Open a test issue in Jira's new issue view and find **CodeBuddy 2.0** in the issue `•••` menu. Confirm the panel loads a supported trace and shows all three levels.
4. Run the cases in [TEST-CHECKLIST.md](TEST-CHECKLIST.md), including repository context and a no-trace issue.
5. Check the Rovo picker on that same site. Record whether the CodeBuddy agent appears and responds; Rovo enablement is tenant-specific.

Do not share screenshots or logs containing API keys, Forge tokens, private issue data, or personal information.
