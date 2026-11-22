import assert from 'node:assert/strict';
import test from 'node:test';
import { adfToText, loadIssueText } from './loadIssueText';
import { parseStackTrace } from '../parser/parseStackTrace';

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

test('flattens Jira document nodes while preserving paragraph and code line breaks', () => {
  const text = adfToText({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Traceback:' }] },
    { type: 'codeBlock', content: [{ type: 'text', text: 'Error\n at app.js:2' }] },
  ] });
  assert.equal(text, 'Traceback:\nError\n at app.js:2\n');
});

test('keeps a repository hyperlink URL when Jira displays friendly link text', () => {
  const text = adfToText({ type: 'paragraph', content: [{
    type: 'text',
    text: 'source repository',
    marks: [{ type: 'link', attrs: { href: 'https://github.com/acme/app' } }],
  }] });
  assert.match(text, /source repository https:\/\/github\.com\/acme\/app/);
});

test('extracts a Python trace from a realistic ADF code block', () => {
  const text = adfToText({ type: 'doc', version: 1, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'The API request fails. Owner: ' }, {
      type: 'mention', attrs: { id: 'account-123', text: '@Jordan Lee', userType: 'DEFAULT' },
    }] },
    { type: 'codeBlock', attrs: { language: 'python' }, content: [{ type: 'text', text: [
      'Traceback (most recent call last):',
      '  File "src/api.py", line 42, in handle_request',
      '    return int(payload["count"])',
      "KeyError: 'count'",
    ].join('\n') }] },
  ] });

  assert.match(text, /@Jordan Lee/);
  const parsed = parseStackTrace(text);
  assert.equal(parsed?.language, 'python');
  assert.equal(parsed?.errorType, 'KeyError');
  assert.equal(parsed?.relevantFrame?.filePath, 'src/api.py');
  assert.equal(parsed?.relevantFrame?.line, 42);
});

test('extracts a JavaScript trace from paragraphs, nested lists, inline code, and hard breaks', () => {
  const text = adfToText({ type: 'doc', version: 1, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'The UI crashes after a response with no user.' }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'TypeError: Cannot read properties of ' },
      { type: 'text', text: 'undefined', marks: [{ type: 'code' }] },
      { type: 'hardBreak' },
      { type: 'text', text: 'Stack frames follow:' },
    ] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Client frame:' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: '    at renderUser (/app/src/user.js:12:9)' }] },
      ] }] },
    ] }] },
  ] });

  const parsed = parseStackTrace(text);
  assert.equal(parsed?.language, 'javascript');
  assert.equal(parsed?.errorType, 'TypeError');
  assert.equal(parsed?.relevantFrame?.filePath, '/app/src/user.js');
  assert.equal(parsed?.relevantFrame?.line, 12);
});

test('parses a trace split across Jira ADF comments', async () => {
  const result = await loadIssueText('DEV-26', async (uri) => {
    if (uri.includes('/comment?')) return response({
      startAt: 0,
      total: 2,
      comments: [
        { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'TypeError: Cannot read properties of ' },
          { type: 'text', text: 'undefined', marks: [{ type: 'code' }] },
        ] }] } },
        { body: { type: 'doc', version: 1, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'I copied the rest from the browser console:' }] },
          { type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: '    at renderUser (/app/src/user.js:12:9)' }] },
        ] } },
      ],
    });
    return response({ fields: { description: { type: 'doc', version: 1, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Reproduces after loading profile data.' }] },
    ] } } });
  });

  const parsed = parseStackTrace(result.text);
  assert.equal(parsed?.language, 'javascript');
  assert.equal(parsed?.errorType, 'TypeError');
  assert.equal(parsed?.relevantFrame?.filePath, '/app/src/user.js');
  assert.equal(parsed?.relevantFrame?.line, 12);
});

test('preserves ADF mention fallback and line breaks in a Jira paragraph', () => {
  const text = adfToText({ type: 'paragraph', content: [
    { type: 'text', text: 'Assigned to ' },
    { type: 'mention', attrs: { id: 'account-456' } },
    { type: 'hardBreak' },
    { type: 'text', text: 'Please review the stack trace.' },
  ] });
  assert.equal(text, 'Assigned to @unknown\nPlease review the stack trace.\n');
});

test('reads a Jira description and paginates all issue comments through the injected user request', async () => {
  const calls = [];
  const result = await loadIssueText('DEV-23', async (uri) => {
    calls.push(uri);
    if (uri.includes('/comment?startAt=0')) return response({
      startAt: 0, total: 2, comments: [{ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First comment trace' }] }] } }],
    });
    if (uri.includes('/comment?startAt=1')) return response({
      startAt: 1, total: 2, comments: [{ body: 'Second comment' }],
    });
    return response({ fields: { description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Issue description' }] }] } } });
  });
  assert.equal(result.text, 'Issue description\n\nFirst comment trace\n\nSecond comment');
  assert.equal(calls.length, 3);
  assert.match(calls[0], /fields=description/);
  assert.match(calls[1], /startAt=0/);
});

test('keeps description analysis available when comment access fails', async () => {
  const result = await loadIssueText('DEV-24', async (uri) => uri.includes('/comment?')
    ? response({ message: 'Forbidden' }, 403)
    : response({ fields: { description: 'NameError: x' } }));
  assert.equal(result.text, 'NameError: x');
  assert.match(result.warning, /HTTP 403/);
});

test('caps comment pagination and reports when older comments were omitted', async () => {
  const calls = [];
  const result = await loadIssueText('DEV-27', async (uri) => {
    calls.push(uri);
    if (uri.includes('/comment?')) {
      const startAt = Number(new URLSearchParams(uri.split('?')[1]).get('startAt'));
      return response({
        startAt,
        total: 250,
        comments: Array.from({ length: 100 }, (_, index) => ({ body: `comment ${startAt + index}` })),
      });
    }
    return response({ fields: { description: 'Issue description' } });
  }, { maxCommentPages: 2 });

  assert.equal(calls.length, 3);
  assert.match(result.text, /comment 199/);
  assert.doesNotMatch(result.text, /comment 200/);
  assert.match(result.warning, /Only the first 200 Jira comments/);
});

test('returns a comment warning when a slow Jira response exceeds its request budget', async () => {
  const result = await loadIssueText('DEV-28', async (uri) => {
    if (uri.includes('/comment?')) {
      // Ignore AbortSignal so the timeout race, rather than cooperative
      // cancellation from this fake transport, must bound the wait.
      await new Promise((resolve) => setTimeout(resolve, 100));
      return response({ comments: [], total: 0 });
    }
    return response({ fields: { description: 'NameError: missing_name' } });
  }, { requestTimeoutMs: 5 });

  assert.equal(result.text, 'NameError: missing_name');
  assert.match(result.warning, /could not load all comments/);
});

test('rejects invalid issue keys and reports denied issue access without returning response bodies', async () => {
  await assert.rejects(() => loadIssueText('not-an-issue', async () => response({})), /invalid/);
  await assert.rejects(() => loadIssueText('DEV-25', async () => response({ secret: 'private issue data' }, 403)), /HTTP 403/);
});
