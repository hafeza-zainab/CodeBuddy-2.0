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

function generatedHints(fields = {}) {
  return {
    nudge: 'Question?',
    pointer: 'src/app.py:9 has the failing lookup.',
    fix_explanation: 'Check the value before using it.',
    fix_code: 'value = payload.get("count")',
    fix_language: 'python',
    ...fields,
  };
}

function generatedResponse(fields) {
  return response({ candidates: [{ content: { parts: [{ text: JSON.stringify(generatedHints(fields)) }] } }] });
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
  assert.doesNotMatch(`${result.nudge} ${result.pointer} ${result.fixExplanation}`, /[*#`]/);
  assert.doesNotMatch(result.fixExplanation, /```/);
  assert.match(result.fixCode, /user_name/);
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
    assert.equal(result.fallbackReason, 'gemini-3.1-flash-lite: 403');
    assert.match(logs[0], /fallback_reason=gemini-3\.1-flash-lite: 403/);
    assert.doesNotMatch(logs.join(' '), /private-test-key/);
  } finally {
    console.log = originalLog;
  }
});

test('moves from a 503 model to the next free model and reports the model that answered', async () => {
  const urls = [];
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    retryDelayMs: 0,
    fetcher: async (url) => {
      urls.push(url);
      if (urls.length === 1) return response({}, 503);
      return generatedResponse({ nudge: 'n', pointer: 'p', fix_explanation: 'f', fix_code: '', fix_language: 'python' });
    },
  });

  assert.equal(urls.length, 2);
  assert.match(urls[0], /gemini-3\.1-flash-lite/);
  assert.match(urls[1], /gemini-3\.5-flash-lite/);
  assert.equal(result.source, 'ai');
  assert.equal(result.model, 'gemini-3.5-flash-lite');
});

test('reports each model failure after exhausting the free model chain', async () => {
  const statuses = [503, 429, 503];
  const urls = [];
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    retryDelayMs: 0,
    fetcher: async (url) => {
      urls.push(url);
      return response({}, statuses[urls.length - 1]);
    },
  });

  assert.equal(urls.length, 3);
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'gemini-3.1-flash-lite: 503, gemini-3.5-flash-lite: 429, gemini-3.8-flash: 503');
});

test('does not retry a non-transient Gemini 403 response', async () => {
  let calls = 0;
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    fetcher: async () => { calls += 1; return response({}, 403); },
  });
  assert.equal(calls, 1);
  assert.equal(result.fallbackReason, 'gemini-3.1-flash-lite: 403');
});

test('uses a valid Gemini response and sends the encrypted key only as a request header', async () => {
  let request;
  const result = await generateHints(sampleTrace(), 'name = "Ari"', {
    apiKey: 'secret-test-value',
    fetcher: async (url, init) => {
      request = { url, init };
      return generatedResponse({ nudge: 'Question?', pointer: 'src/app.py:9', fix_explanation: 'Use the right name.', fix_code: '', fix_language: 'python' });
    },
  });
  assert.equal(result.source, 'ai');
  assert.equal(result.nudge, 'Question?');
  assert.equal(result.fixExplanation, 'Use the right name.');
  assert.equal(JSON.parse(request.init.body).generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(JSON.parse(request.init.body).generationConfig.responseSchema.required, [
    'nudge', 'pointer', 'fix_explanation', 'fix_code', 'fix_language',
  ]);
  assert.equal(request.init.headers['x-goog-api-key'], 'secret-test-value');
  assert.equal(request.init.body.includes('secret-test-value'), false);
  assert.match(request.url, /:generateContent$/);
});

test('accepts a structured JSON object wrapped in a Markdown JSON fence', async () => {
  const fields = generatedHints({ fix_code: 'return int(payload["count"])' });
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    fetcher: async () => response({ candidates: [{ content: { parts: [{ text: `\`\`\`json\n${JSON.stringify(fields)}\n\`\`\`` }] } }] }),
  });

  assert.equal(result.source, 'ai');
  assert.equal(result.fixCode, 'return int(payload["count"])');
  assert.equal(result.fixLanguage, 'python');
});

test('sanitizes Markdown from every model prose field while preserving multiline code', async () => {
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    fetcher: async () => generatedResponse({
      nudge: '**What** should happen to `payload` here?',
      pointer: '## Pointer\nThe `count` key is missing.',
      fix_explanation: 'The **`count`** key is absent. Use *a deliberate default* only if zero is correct.',
      fix_code: 'if "count" not in payload:\n    raise ValueError("count is required")\nreturn int(payload["count"])',
    }),
  });

  assert.equal(result.nudge, 'What should happen to payload here?');
  assert.equal(result.pointer, 'Pointer\nThe count key is missing.');
  assert.equal(result.fixExplanation, 'The count key is absent. Use a deliberate default only if zero is correct.');
  assert.equal(result.fixCode, 'if "count" not in payload:\n    raise ValueError("count is required")\nreturn int(payload["count"])');
  assert.doesNotMatch(`${result.nudge} ${result.pointer} ${result.fixExplanation}`, /[*#`]/);
});

test('removes bullet markers and literal Markdown characters from AI hint levels', async () => {
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    fetcher: async () => generatedResponse({
      nudge: '**Question**: is `payload` ready?',
      pointer: '### Cause\n- The key is missing.\n* Check the value.',
      fix_explanation: '1. Validate **count** first.\n- Then convert it.',
      fix_code: 'payload.get("count")',
      fix_language: 'python',
    }),
  });
  assert.equal(result.nudge, 'Question: is payload ready?');
  assert.equal(result.pointer, 'Cause\nThe key is missing.\nCheck the value.');
  assert.equal(result.fixExplanation, 'Validate count first.\nThen convert it.');
  assert.equal(result.fixCode, 'payload.get("count")');
});

test('leniently extracts the first JSON object from surrounding model text', async () => {
  const fields = generatedHints({ nudge: 'Nudge from JSON.' });
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    fetcher: async () => response({ candidates: [{ content: { parts: [{ text: `Here is the result:\n${JSON.stringify(fields)}\nThanks.` }] } }] }),
  });
  assert.equal(result.source, 'ai');
  assert.equal(result.nudge, 'Nudge from JSON.');
});

test('uses the template fallback with bad_ai_output when structured fields are missing', async () => {
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    fetcher: async () => response({ candidates: [{ content: { parts: [{ text: '{"nudge":"Question?","pointer":"src/app.py:9"}' }] } }] }),
  });
  assert.equal(result.source, 'template');
  assert.match(result.fallbackReason, /^gemini-3\.1-flash-lite: bad_ai_output/);
  assert.ok(result.fixExplanation);
  assert.ok(result.fixCode);
});

test('retries a rate-limited request once and then uses a successful answer', async () => {
  let calls = 0;
  const result = await generateHints(sampleTrace(), undefined, {
    apiKey: 'test-key',
    retryDelayMs: 0,
    fetcher: async () => {
      calls += 1;
      if (calls === 1) return response({}, 429);
      return generatedResponse({ nudge: 'n', pointer: 'p', fix_explanation: 'f', fix_code: '', fix_language: 'python' });
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
  assert.equal(calls, 3);
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'gemini-3.1-flash-lite: timeout, gemini-3.5-flash-lite: timeout, gemini-3.8-flash: timeout');
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
      return generatedResponse({ nudge: 'n', pointer: 'p', fix_explanation: 'f', fix_code: '', fix_language: 'python' });
    },
  });

  assert.equal(calls, 3);
  assert.equal(result.source, 'template');
  assert.equal(result.fallbackReason, 'gemini-3.1-flash-lite: timeout, gemini-3.5-flash-lite: timeout, gemini-3.8-flash: timeout');
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
  assert.match(result.fallbackReason, /^gemini-3\.1-flash-lite: bad_ai_output/);
  assert.match(result.fix, /general example/);
});
