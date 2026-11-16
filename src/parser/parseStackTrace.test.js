import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStackTrace } from './parseStackTrace.ts';

const cases = [
  {
    language: 'python',
    text: 'Traceback (most recent call last):\n  File "app.py", line 8, in run\nNameError: name \'user\' is not defined',
    file: 'app.py', line: 8, type: 'NameError',
  },
  {
    language: 'python',
    text: '{code:python}Traceback (most recent call last): File \'src/api.py\', line 42, in handle\nValueError: bad input{code}',
    file: 'src/api.py', line: 42, type: 'ValueError',
  },
  {
    language: 'python',
    text: 'Traceback (most recent call last):\nFile "<frozen importlib._bootstrap>", line 241, in _call_with_frames_removed\nFile "/srv/app/main.py", line 17, in main\nKeyError: \'user_id\'',
    file: '/srv/app/main.py', line: 17, type: 'KeyError',
  },
  {
    language: 'python',
    text: 'Traceback (most recent call last):\n  File "C:\\work\\src\\worker.py", line 105, in process\n  File "C:\\work\\src\\db.py", line 21, in lookup\n  File "C:\\Python\\Lib\\site-packages\\pkg\\core.py", line 9, in get\nZeroDivisionError: division by zero',
    file: 'C:\\work\\src\\db.py', line: 21, type: 'ZeroDivisionError',
  },
  {
    language: 'python',
    text: '```text\nTraceback (most recent call last):\nFile "src/calc.py", line 3, in total\n  return sum(values)\nTypeError: unsupported operand type(s)\n```',
    file: 'src/calc.py', line: 3, type: 'TypeError',
  },
  {
    language: 'javascript',
    text: 'TypeError: Cannot read properties of undefined\n    at renderUser (/app/src/user.js:12:9)\n    at process (/app/node_modules/framework/index.js:4:1)',
    file: '/app/src/user.js', line: 12, type: 'TypeError',
  },
  {
    language: 'javascript',
    text: 'ReferenceError: count is not defined\nat /srv/app/index.js:7:3',
    file: '/srv/app/index.js', line: 7, type: 'ReferenceError',
  },
  {
    language: 'javascript',
    text: 'Error: fetch failed\n    at async loadData (file:///workspace/src/load.ts:31:14)',
    file: 'file:///workspace/src/load.ts', line: 31, type: 'Error',
  },
  {
    language: 'javascript',
    text: 'SyntaxError: Unexpected token\n    at Object.<anonymous> (C:\\project\\src\\index.js:2:5)',
    file: 'C:\\project\\src\\index.js', line: 2, type: 'SyntaxError',
  },
  {
    language: 'javascript',
    text: 'Uncaught TypeError: x is null\n    at onClick (https://example.test/assets/app.js:90:2)\n    at https://example.test/vendor.js:1:4',
    file: 'https://example.test/assets/app.js', line: 90, type: 'TypeError',
  },
  {
    language: 'java',
    text: 'java.lang.NullPointerException: user was null\n\tat com.example.App.run(App.java:24)\n\tat java.base/java.util.Objects.requireNonNull(Objects.java:235)',
    file: 'App.java', line: 24, type: 'NullPointerException',
  },
  {
    language: 'java',
    text: 'Exception in thread "main" java.lang.IllegalArgumentException: invalid id\nat org.demo.Main.main(Main.java:10)',
    file: 'Main.java', line: 10, type: 'IllegalArgumentException',
  },
  {
    language: 'java',
    text: '{code}java.io.IOException: failed\n at org.demo.FileReader.open(FileReader.java:70){code}',
    file: 'FileReader.java', line: 70, type: 'IOException',
  },
  {
    language: 'java',
    text: 'java.lang.RuntimeException: request failed\n at com.demo.Service.call(Service.java:51)\nCaused by: java.net.SocketTimeoutException: timeout\n at com.demo.Client.send(Client.java:18)',
    file: 'Client.java', line: 18, type: 'SocketTimeoutException',
  },
  {
    language: 'java',
    text: '[code=java]Caused by: com.demo.DataException: missing row\n    at com.demo.Repository.find(Repository.java:33)[/code]',
    file: 'Repository.java', line: 33, type: 'DataException',
  },
  {
    language: 'java',
    text: 'java.lang.AssertionError: expected true\nat com.demo.Check.run(Check.java:44)\nat java.base/java.lang.Thread.run(Thread.java:833)',
    file: 'Check.java', line: 44, type: 'AssertionError',
  },
];

for (const sample of cases) {
  test(`${sample.language}: parses ${sample.type} and selects its app frame`, () => {
    const parsed = parseStackTrace(sample.text);
    assert.ok(parsed);
    assert.equal(parsed.language, sample.language);
    assert.equal(parsed.errorType, sample.type);
    assert.equal(parsed.relevantFrame?.filePath, sample.file);
    assert.equal(parsed.relevantFrame?.line, sample.line);
  });
}

test('returns null for text without a recognizable stack frame', () => {
  assert.equal(parseStackTrace('The issue is that the page is slow.'), null);
  assert.equal(parseStackTrace(null), null);
  assert.equal(parseStackTrace(''), null);
});

test('uses the deepest Java cause as the reported error', () => {
  const parsed = parseStackTrace(cases[13].text);
  assert.equal(parsed?.errorType, 'SocketTimeoutException');
  assert.equal(parsed?.message, 'timeout');
});

test('skips framework-only frames without losing the trace', () => {
  const parsed = parseStackTrace('TypeError: x\n at render (/app/node_modules/ui/index.js:2:1)');
  assert.ok(parsed);
  assert.equal(parsed.relevantFrame, null);
});
