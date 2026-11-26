# Manual Jira test checklist

Run after deploying the intended environment and upgrading the Jira installation. Create one issue per case or replace the issue text between runs. The examples use `https://github.com/hafeza-zainab/CodeBuddy-2.0`, which should be publicly accessible; confirm the repository is public before running the happy path. For the happy path, `src/parser/parseStackTrace.ts` exists at the repository root. The trace line number is a source-context lookup target and need not represent a historical runtime failure.

## Python happy path with real public repository

**Issue description to paste:**

```text
Repository: https://github.com/hafeza-zainab/CodeBuddy-2.0

Traceback (most recent call last):
  File "src/parser/parseStackTrace.ts", line 1, in parseStackTrace
TypeError: invalid input
```

- [ ] Pass: panel detects a trace and reports repository context loaded from the public repo. Gemini AI hints appear if the key/quota is available; otherwise useful template hints appear.
- [ ] Pass: full fix code is rendered as a code block and not as raw Markdown.

## JavaScript trace

**Issue description to paste:**

```text
TypeError: Cannot read properties of undefined (reading 'profile')
    at renderUser (/workspace/app/src/user.js:12:9)
    at process (/workspace/app/node_modules/runtime/index.js:4:1)
```

- [ ] Pass: panel reports JavaScript, selects the application frame `src/user.js:12`, and shows Nudge, Pointer, and Full fix.

## Java trace with cause chain

**Issue description to paste:**

```text
java.lang.RuntimeException: request failed
    at com.example.Service.load(Service.java:8)
Caused by: java.net.SocketTimeoutException: timed out
    at com.example.Client.send(Client.java:42)
    at java.base/java.net.Socket.connect(Socket.java:631)
```

- [ ] Pass: panel reports `SocketTimeoutException` and points to `Client.java:42`, skipping the JDK frame.

## Python trace

**Issue description to paste:**

```text
Traceback (most recent call last):
  File "src/buggy_app.py", line 42, in handle_request
    return int(payload["count"])
KeyError: 'count'
```

- [ ] Pass: panel reports `KeyError`, includes the `count` key and `payload` variable in the fallback or AI response, and shows all three hint levels.

## No trace

**Issue description to paste:**

```text
The settings page is slower than expected after the latest release. No exception was recorded.
```

- [ ] Pass: panel shows “No stack trace found” without throwing or displaying a raw error.

## Bad or inaccessible repository link

**Issue description to paste:**

```text
Repository: https://github.com/codebuddy-qa/nonexistent-public-repo
TypeError: invalid record
    at parseRecord (/workspace/app/src/record.js:17:2)
```

- [ ] Pass: panel shows a friendly repository-unavailable message and still returns trace-based hints.

## Rovo agent and action

Use the Python trace above in a Jira issue, then open the Rovo agent picker and select **CodeBuddy 2.0**. Ask: `Analyze DEV-123` (replace with the test issue key).

- [ ] Pass: agent is visible in the picker and returns Nudge, Pointer, and Full fix based on that issue.
- [ ] Pass: when no issue key/current issue/trace is provided, the agent asks for a Jira issue key or pasted trace.

## Markdown rendering

Open a successful trace issue and inspect each hint level.

- [ ] Pass: prose has no literal heading/bullet/backtick/bold markers; Full fix code is a separate formatted code block.

## Second account

Use a second Atlassian account that is a Jira site admin for install and has permission to view the test issue for runtime use.

- [ ] Pass: account can follow the production install link, approve the listed scope, find the panel, and get hints on an issue it can view.
- [ ] Pass: if Rovo is enabled for the site/account, the agent appears and responds; otherwise record the site's Rovo availability as a limitation.
