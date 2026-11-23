import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeIssue } from './analyzeIssue';
import { loadGithubContext } from '../github/loadGithubContext';

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

test('keeps template hints available when GitHub times out without source context', async () => {
  let requests = 0;
  const result = await analyzeIssue(`${traceText}\nRepository: https://github.com/acme/app`, {
    githubOptions: {
      requestTimeoutMs: 5,
      stageBudgetMs: 5_000,
      fetcher: (_url, init) => {
        requests += 1;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('transport abort')));
        });
      },
    },
    hintOptions: { apiKey: '' },
  });

  assert.equal(requests, 2);
  assert.equal(result.github.status, 'request-failed');
  assert.match(result.github.message, /could not be reached/i);
  assert.equal(result.github.snippet, undefined);
  assert.equal(result.hints.source, 'template');
  assert.ok(result.hints.fix.length > 0);
  assert.match(result.hints.pointer, /src\/app.py:8/);
});

test('skips GitHub and immediately uses template hints after the total deadline', async () => {
  let githubCalls = 0;
  let hintOptions;
  const result = await analyzeIssue(traceText, {
    deadlineAt: 99,
    now: () => 100,
    loadGithubContextFn: async () => { githubCalls += 1; throw new Error('must be skipped'); },
    generateHintsFn: async (_trace, snippet, options) => {
      assert.equal(snippet, undefined);
      hintOptions = options;
      return { source: 'template', nudge: 'n', pointer: 'p', fix: 'f' };
    },
  });

  assert.equal(githubCalls, 0);
  assert.equal(hintOptions.apiKey, '');
  assert.equal(result.github.status, 'request-failed');
  assert.match(result.github.message, /deadline was reached/);
  assert.equal(result.hints.source, 'template');
});

test('bounds GitHub lookup to its stage deadline before continuing to hints', async () => {
  let githubCalls = 0;
  let hintOptions;
  const result = await analyzeIssue(`${traceText}\nRepository: https://github.com/acme/app`, {
    now: () => 100,
    deadlineAt: 10_000,
    loadGithubContextFn: async (_text, _frame, options) => {
      githubCalls += 1;
      assert.equal(options.deadlineAt, 5_100);
      return { status: 'request-failed', message: 'GitHub timed out.' };
    },
    generateHintsFn: async (_trace, _snippet, options) => {
      hintOptions = options;
      return { source: 'template', nudge: 'n', pointer: 'p', fix: 'f' };
    },
  });

  assert.equal(githubCalls, 1);
  assert.equal(hintOptions.apiKey, undefined);
  assert.equal(result.hints.source, 'template');
});

test('skips Gemini and uses templates when GitHub consumed the remaining deadline', async () => {
  let currentTime = 100;
  let hintOptions;
  const deadlineAt = 5_000;
  const result = await analyzeIssue(traceText, {
    now: () => currentTime,
    deadlineAt,
    loadGithubContextFn: async () => {
      currentTime = deadlineAt - 50;
      return { status: 'request-failed', message: 'GitHub consumed the budget.' };
    },
    generateHintsFn: async (_trace, _snippet, options) => {
      hintOptions = options;
      return { source: 'template', nudge: 'n', pointer: 'p', fix: 'f' };
    },
  });

  assert.equal(hintOptions.apiKey, '');
  assert.equal(result.hints.source, 'template');
});

test('makes no GitHub request when the app reports an elapsed analysis deadline', async () => {
  const result = await loadGithubContext(`${traceText}\nhttps://github.com/acme/app`, {
    filePath: 'src/app.py', line: 8, functionName: 'run',
  }, { deadlineAt: 1, now: () => 2, fetcher: async () => { throw new Error('must be skipped'); } });
  assert.equal(result.status, 'request-failed');
});
