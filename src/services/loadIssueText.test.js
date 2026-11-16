import assert from 'node:assert/strict';
import test from 'node:test';
import { adfToText, loadIssueText } from './loadIssueText.ts';

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

test('rejects invalid issue keys and reports denied issue access without returning response bodies', async () => {
  await assert.rejects(() => loadIssueText('not-an-issue', async () => response({})), /invalid/);
  await assert.rejects(() => loadIssueText('DEV-25', async () => response({ secret: 'private issue data' }, 403)), /HTTP 403/);
});
