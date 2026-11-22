import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handleRovoAction } from './rovoAction';

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
  assert.match(prompt, /no trace, issue key, or current Jira issue context, ask the user to paste the trace or provide a Jira issue key/);
  assert.match(prompt, /Nudge is a reflective question/);
  assert.match(prompt, /Pointer identifies the relevant file and line/);
  assert.match(prompt, /Full fix gives a concrete correction/);
  assert.match(prompt, /finds no supported trace in the issue, ask the user to paste the stack trace/);
});

test('returns a privacy-safe read error when Jira denies the action user', async () => {
  const result = await handleRovoAction({ issueKey: 'DEV-90' }, {}, {
    loadIssueTextFn: async () => { throw new Error('private description contents'); },
  });
  assert.equal(result.status, 'issue-read-failed');
  assert.equal(JSON.stringify(result).includes('private description'), false);
});
