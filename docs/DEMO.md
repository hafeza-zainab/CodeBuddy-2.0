# CodeBuddy 2.0 demo video script

Target runtime: about 4 minutes. Record in Jira's new issue view with a non-sensitive issue and no copyrighted music. Narration or silence is fine. Do not display API keys, account tokens, private issue content, or personal data.

| Time | On screen and narration |
| --- | --- |
| 0:00–0:25 | Introduce CodeBuddy 2.0 as a Jira Forge panel that helps developers investigate stack traces with progressive hints. |
| 0:25–0:55 | Open a Jira issue containing a real supported trace. Launch CodeBuddy 2.0 from the issue's **•••** menu and show the detected language and error. |
| 0:55–1:35 | Show repository context from a public repository link, or the friendly unavailable status if GitHub cannot be used. Explain that hints can still use the trace alone. |
| 1:35–2:35 | Walk through **Nudge**, **Pointer**, and **Full fix** in order. Show the code as a code block and note whether Gemini or deterministic templates produced the hints. |
| 2:35–3:10 | Open a no-trace issue and show the clean empty state. Return to a trace issue. |
| 3:10–3:45 | Open the Rovo agent picker, select CodeBuddy 2.0, and ask it to analyze an issue key or pasted trace. Show the same three hint levels. If Rovo is unavailable on the demo site, explain that the manifest includes the agent/action without presenting an unrun interaction as live. |
| 3:45–4:05 | Close by stating the limitations: supported trace formats, public-only GitHub context, and suggestions are guidance rather than guaranteed patches. |

Keep the final cut under 4:30. If demonstrating template fallback, use a dedicated development/test environment where Gemini is not configured or is unavailable; do not overwrite a production secret to force the fallback.
