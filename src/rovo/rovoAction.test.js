import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handleRovoAction } from './rovoAction';
import { analyzeIssue } from '../services/analyzeIssue';

const analysis = { status: 'ok', hints: { source: 'template', nudge: 'n', pointer: 'p', fix: 'f' } };

test('analyzes pasted trace without requesting Jira issue data', async () => {
  let loaded = false;
  let analyzed;
  const result = await handleRovoAction({ trace: 'TypeError: broken\n at app.js:3:4' }, {}, {
    loadIssueTextFn: async () => { loaded = true; return { text: '' }; },
    analyzeIssueFn: async (text) => { analyzed = text; return analysis; },
  });
  assert.equal(result, analysis);
  assert.equal(analyzed, 'TypeError: broken\n at app.js:3:4');
  assert.equal(loaded, false);
});

test('loads an issue from the action input using the shared analyzer', async () => {
  const events = [];
  const result = await handleRovoAction({ issueKey: 'DEV-32' }, {}, {
    loadIssueTextFn: async (key) => {
      events.push(`read:${key}`);
      return { text: 'Traceback: app.py line 4', warning: 'Comments could not be fully loaded.' };
    },
    analyzeIssueFn: async (text, options) => {
      events.push(`analyze:${options.issueWarning}`);
      assert.match(text, /app.py/);
      return analysis;
    },
  });
  assert.equal(result, analysis);
  assert.deepEqual(events, ['read:DEV-32', 'analyze:Comments could not be fully loaded.']);
});

test('uses Jira issue context supplied by Rovo when no issue key input is present', async () => {
  let requestedKey;
  const result = await handleRovoAction({ context: { jira: { issueKey: 'OPS-7' } } }, {}, {
    loadIssueTextFn: async (key) => { requestedKey = key; return { text: 'trace text' }; },
    analyzeIssueFn: async () => analysis,
  });
  assert.equal(requestedKey, 'OPS-7');
  assert.equal(result, analysis);
});

test('returns a clear input message when there is no trace or valid issue key', async () => {
  const result = await handleRovoAction({ issueKey: 'not a key' });
  assert.equal(result.status, 'input-required');
  assert.match(result.message, /issue key or paste a stack trace/);
});

test('agent prompt explains the three hint levels and how to request missing input', async () => {
  const manifest = await readFile(new URL('../../manifest.yml', import.meta.url), 'utf8');
  const prompt = await readFile(new URL('../../resources/rovo/agent-prompt/prompt.txt', import.meta.url), 'utf8');
  assert.match(manifest, /prompt: resource:agent-prompt;prompt\.txt/);
  assert.match(prompt, /neither a pasted trace nor a current Jira issue is available, ask the user for a Jira issue key or a pasted trace/);
  assert.match(prompt, /Nudge is a reflective question/);
  assert.match(prompt, /Pointer identifies the relevant file and line/);
  assert.match(prompt, /Full fix gives a concrete correction/);
  assert.match(prompt, /finds no supported trace in the issue, ask the user to paste the stack trace/);
});

test('handler returns three hints for a valid issue using the shared analyzer', async () => {
  const result = await handleRovoAction({ issueKey: 'DEV-101' }, {}, {
    loadIssueTextFn: async () => ({ text: 'TypeError: invalid value\n at run (/repo/src/app.js:12:3)' }),
    analyzeIssueFn: (text, options) => analyzeIssue(text, {
      ...options,
      loadGithubContextFn: async () => ({ status: 'missing-repo-url', message: 'No public repo link.' }),
      generateHintsFn: async () => ({ source: 'template', nudge: 'n', pointer: 'p', fix: 'f' }),
    }),
  });
  assert.equal(result.status, 'ok');
  assert.deepEqual(Object.keys(result.hints).filter((key) => ['nudge', 'pointer', 'fix'].includes(key)).sort(), ['fix', 'nudge', 'pointer']);
});

test('handler returns the no-trace state for an issue without stack frames', async () => {
  const result = await handleRovoAction({ issueKey: 'DEV-102' }, {}, {
    loadIssueTextFn: async () => ({ text: 'The page is slow after login.' }),
  });
  assert.equal(result.status, 'no-trace');
  assert.match(result.message, /No supported stack trace/);
});

test('handler keeps trace hints available when an issue contains a bad repository link', async () => {
  const result = await handleRovoAction({ issueKey: 'DEV-103' }, {}, {
    loadIssueTextFn: async () => ({ text: 'https://github.com/not-valid TypeError: failed\n    at run (/repo/src/app.js:12:3)' }),
    analyzeIssueFn: (text, options) => analyzeIssue(text, {
      ...options,
      loadGithubContextFn: async () => ({ status: 'invalid-repo-url', message: 'Invalid public repository URL.' }),
      generateHintsFn: async () => ({ source: 'template', nudge: 'n', pointer: 'p', fix: 'f' }),
    }),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.github.status, 'invalid-repo-url');
  assert.equal(result.hints.source, 'template');
});

test('handler returns template hints when Gemini fails', async () => {
  const result = await handleRovoAction({ issueKey: 'DEV-104' }, {}, {
    loadIssueTextFn: async () => ({ text: 'TypeError: failed\n    at run (/repo/src/app.js:12:3)' }),
    analyzeIssueFn: (text, options) => analyzeIssue(text, {
      ...options,
      loadGithubContextFn: async () => ({ status: 'missing-repo-url', message: 'No public repo link.' }),
      generateHintsFn: async () => ({ source: 'template', fallbackReason: 'gemini_error: 503', nudge: 'n', pointer: 'p', fix: 'f' }),
    }),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.hints.source, 'template');
  assert.equal(result.hints.fallbackReason, 'gemini_error: 503');
});

test('returns a privacy-safe read error when Jira denies the action user', async () => {
  const result = await handleRovoAction({ issueKey: 'DEV-90' }, {}, {
    loadIssueTextFn: async () => { throw new Error('private description contents'); },
  });
  assert.equal(result.status, 'issue-read-failed');
  assert.equal(JSON.stringify(result).includes('private description'), false);
});
