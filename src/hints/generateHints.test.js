import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStackTrace } from '../parser/parseStackTrace';
import { generateHints } from './generateHints';

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
  assert.equal(result.fallbackReason, 'no_key');
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

test('tailors the Python KeyError fallback to the missing key in the trace', async () => {
  const trace = parseStackTrace([
    'File "src/buggy_app.py", line 42, in handle_request',
    'return int(payload["count"])',
    "KeyError: 'count'",
  ].join('\n'));
  const result = await generateHints(trace, undefined, { apiKey: '' });

  assert.equal(result.source, 'template');
  assert.match(result.pointer, /key "count" is missing from payload/);
  assert.match(result.fix, /if "count" not in payload:/);
  assert.match(result.fix, /Required field 'count' is missing/);
  assert.match(result.fix, /return int\(payload\["count"\]\)/);
  assert.doesNotMatch(result.fix, /email|user\.get/);
});

test('tailors fallback pointers and fixes to names from each supported error', async (t) => {
  const cases = [
    ['python', 'IndexError: list index out of range', 'items[index]', 'items', /items|index/],
    ['python', "TypeError: unsupported operand type(s) for +: 'int' and 'str'", 'total + amount', 'amount', /total|amount/],
    ['python', "AttributeError: 'NoneType' object has no attribute 'name'", 'return user.name', 'user.name', /user|name/],
    ['python', "NameError: name 'user_id' is not defined", 'return user_id', 'user_id', /user_id/],
    ['python', 'ZeroDivisionError: division by zero', 'ratio = total / divisor', 'divisor', /total|divisor/],
    ['python', "ImportError: cannot import name 'parse_count' from 'helpers'", 'from helpers import parse_count', 'parse_count', /parse_count|helpers/],
    ['java', 'java.lang.NullPointerException: Cannot invoke "User.getName()" because "user" is null', 'user', 'getName', /user|getName/],
    ['javascript', 'ReferenceError: userContext is not defined', 'userContext', 'userContext', /userContext/],
    ['javascript', "TypeError: Cannot read properties of undefined (reading 'profile')", 'profile', 'profile', /profile/],
  ];

  for (const [language, error, source, expectedFix, fixPattern] of cases) {
    await t.test(`${language} ${error}`, async () => {
      const text = language === 'python'
        ? `Traceback (most recent call last):\n  File "src/example.py", line 17, in process\n    ${source}\n${error}`
        : language === 'java'
          ? `${error}\n\tat com.example.Service.process(Service.java:17)`
          : `${error}\n    at process (/repo/src/example.js:17:4)`;
      const trace = parseStackTrace(text);
      assert.ok(trace);
      const result = await generateHints(trace, undefined, { apiKey: '' });
      assert.match(result.pointer, /17/);
      assert.match(result.pointer, /process/);
      assert.match(result.fix, fixPattern);
      assert.ok(result.fix.includes(expectedFix));
      assert.doesNotMatch(result.fix, /unknown@example\.test|email/);
    });
  }
});

test('reports a safe Gemini HTTP status and still calls Gemini without repository context', async () => {
  let calls = 0;
  const originalLog = console.log;
  const logs = [];
  console.log = (message) => logs.push(String(message));
  try {
    const result = await generateHints(sampleTrace(), undefined, {
      apiKey: 'private-test-key',
      fetcher: async () => { calls += 1; return response({}, 403); },
    });
    assert.equal(calls, 1);
    assert.equal(result.source, 'template');
    assert.equal(result.fallbackReason, 'gemini_error: 403');
    assert.match(logs[0], /fallback_reason=gemini_error: 403/);
    assert.doesNotMatch(logs.join(' '), /private-test-key/);
  } finally {
    console.log = originalLog;
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
  assert.equal(result.fallbackReason, 'timeout');
  assert.equal(JSON.stringify(result).includes('transport detail'), false);
});

test('falls back before a slow Gemini response completes even if the transport ignores abort', async () => {
  let calls = 0;
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    timeoutMs: 10,
    retryDelayMs: 0,
    // Deliberately ignore AbortSignal to verify the application-level timeout
    // race still returns the deterministic fallback before this mock resolves.
    fetcher: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return response({ candidates: [{ content: { parts: [{ text: '{"nudge":"n","pointer":"p","fix":"f"}' }] } }] });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'timeout');
});

test('skips Gemini and uses templates when the overall deadline has expired', async () => {
  let calls = 0;
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    deadlineAt: 1,
    now: () => 2,
    fetcher: async () => { calls += 1; return response({}); },
  });

  assert.equal(calls, 0);
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'deadline_exceeded');
});

test('falls back on malformed model output and tells the reader the example is generic', async () => {
  const result = await generateHints(sampleTrace(), 'const x = null;', {
    apiKey: 'test-key',
    fetcher: async () => response({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
  });
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'invalid_response');
  assert.match(result.fix, /general example/);
});
