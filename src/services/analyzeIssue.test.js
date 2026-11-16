import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeIssue } from './analyzeIssue.ts';

const traceText = 'Traceback (most recent call last):\n  File "src/app.py", line 8, in run\nNameError: name \'user\' is not defined';

test('returns a no-trace result without making external service calls', async () => {
  let calls = 0;
  const result = await analyzeIssue('This issue has no stack trace.', {
    loadGithubContextFn: async () => { calls += 1; throw new Error('should not run'); },
    generateHintsFn: async () => { calls += 1; throw new Error('should not run'); },
  });
  assert.equal(result.status, 'no-trace');
  assert.match(result.message, /No supported stack trace/);
  assert.equal(calls, 0);
});

test('shares parsed trace, optional GitHub source, hints, and comment warning in its result', async () => {
  const calls = [];
  const result = await analyzeIssue(traceText, {
    issueWarning: 'Some comments were unavailable.',
    loadGithubContextFn: async (text, frame) => {
      calls.push({ type: 'github', text, frame });
      return { status: 'ok', message: 'Source context loaded.', snippet: 'user = "Ari"', startLine: 7, endLine: 9 };
    },
    generateHintsFn: async (trace, snippet) => {
      calls.push({ type: 'hints', trace, snippet });
      return { source: 'template', nudge: 'n', pointer: 'p', fix: 'f' };
    },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.trace.errorType, 'NameError');
  assert.equal(result.github.status, 'ok');
  assert.equal(result.hints.source, 'template');
  assert.equal(result.issueWarning, 'Some comments were unavailable.');
  assert.deepEqual(calls.map((call) => call.type), ['github', 'hints']);
  assert.equal(calls[1].snippet, 'user = "Ari"');
});

test('continues to generate hints when GitHub has no repository link', async () => {
  const result = await analyzeIssue(traceText, {
    loadGithubContextFn: async () => ({ status: 'missing-repo-url', message: 'No repository link.' }),
    generateHintsFn: async (_trace, snippet) => {
      assert.equal(snippet, undefined);
      return { source: 'template', nudge: 'n', pointer: 'p', fix: 'f' };
    },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.github.status, 'missing-repo-url');
  assert.equal(result.hints.source, 'template');
});
