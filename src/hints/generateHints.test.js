import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStackTrace } from '../parser/parseStackTrace.ts';
import { generateHints } from './generateHints.ts';

function sampleTrace(errorType = 'NameError', language = 'python') {
  const examples = {
    python: `Traceback (most recent call last):\n  File "src/app.py", line 9, in run\n${errorType}: missing value`,
    javascript: `${errorType}: invalid value\n    at run (/repo/src/app.js:9:3)`,
    java: `java.lang.${errorType}: invalid value\n\tat com.example.App.run(App.java:9)`,
  };
  return parseStackTrace(examples[language]);
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('returns a useful template hint without making a request when no key is configured', async () => {
  let calls = 0;
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: '',
    fetcher: async () => { calls += 1; return response({}); },
  });
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'no-api-key');
  assert.match(result.nudge, /name/i);
  assert.match(result.pointer, /src\/app.py:9/);
  assert.match(result.fix, /user_name/);
  assert.equal(calls, 0);
});

test('includes deterministic fallback templates for common errors across all supported languages', async () => {
  const traces = [
    sampleTrace('NameError', 'python'), sampleTrace('ImportError', 'python'), sampleTrace('TypeError', 'python'),
    sampleTrace('KeyError', 'python'), sampleTrace('IndexError', 'python'), sampleTrace('AttributeError', 'python'),
    sampleTrace('ZeroDivisionError', 'python'), sampleTrace('ValueError', 'python'), sampleTrace('FileNotFoundError', 'python'),
    sampleTrace('ReferenceError', 'javascript'), sampleTrace('TypeError', 'javascript'), sampleTrace('SyntaxError', 'javascript'),
    sampleTrace('RangeError', 'javascript'), sampleTrace('NullPointerException', 'java'),
    sampleTrace('IllegalArgumentException', 'java'), sampleTrace('IndexOutOfBoundsException', 'java'),
    sampleTrace('ClassCastException', 'java'), sampleTrace('IOException', 'java'), sampleTrace('ArithmeticException', 'java'),
  ];
  for (const trace of traces) {
    const result = await generateHints(trace, undefined, { apiKey: '' });
    assert.equal(result.source, 'template');
    assert.ok(result.nudge.length > 0 && result.pointer.length > 0 && result.fix.length > 0);
  }
});

test('uses a valid Gemini response and sends the encrypted key only as a request header', async () => {
  let request;
  const result = await generateHints(sampleTrace(), 'name = "Ari"', {
    apiKey: 'secret-test-value',
    fetcher: async (url, init) => {
      request = { url, init };
      return response({ candidates: [{ content: { parts: [{ text: JSON.stringify({ nudge: 'Question?', pointer: 'src/app.py:9', fix: 'Use the right name.' }) }] } }] });
    },
  });
  assert.equal(result.source, 'ai');
  assert.equal(result.nudge, 'Question?');
  assert.equal(request.init.headers['x-goog-api-key'], 'secret-test-value');
  assert.equal(request.init.body.includes('secret-test-value'), false);
  assert.match(request.url, /:generateContent$/);
});

test('retries a rate-limited request once and then uses a successful answer', async () => {
  let calls = 0;
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    retryDelayMs: 0,
    fetcher: async () => {
      calls += 1;
      if (calls === 1) return response({}, 429);
      return response({ candidates: [{ content: { parts: [{ text: '{"nudge":"n","pointer":"p","fix":"f"}' }] } }] });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.source, 'ai');
});

test('retries a timed-out request once, then falls back without exposing transport details', async () => {
  let calls = 0;
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    timeoutMs: 2,
    retryDelayMs: 0,
    fetcher: (_url, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('transport detail')));
      });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'request-failed');
  assert.equal(JSON.stringify(result).includes('transport detail'), false);
});

test('falls back on malformed model output and tells the reader the example is generic', async () => {
  const result = await generateHints(sampleTrace(), 'const x = null;', {
    apiKey: 'test-key',
    fetcher: async () => response({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
  });
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'invalid-response');
  assert.match(result.fix, /general example/);
});
