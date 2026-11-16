import assert from 'node:assert/strict';
import test from 'node:test';
import { findGithubRepository, loadGithubContext } from './loadGithubContext.ts';

const frame = { filePath: '/workspace/project/src/app.js', line: 50, functionName: 'run' };

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function contents(source, path = 'src/app.js') {
  return {
    type: 'file',
    name: path.split('/').pop(),
    size: Buffer.byteLength(source),
    encoding: 'base64',
    content: Buffer.from(source, 'utf8').toString('base64'),
  };
}

test('finds a public repository link inside issue text and normalizes .git', () => {
  assert.deepEqual(findGithubRepository('See https://github.com/acme/demo.git for code.'), {
    owner: 'acme', repo: 'demo', url: 'https://github.com/acme/demo', branch: undefined,
  });
  assert.equal(findGithubRepository('No link here'), null);
});

test('returns a clear no-repository status without making an HTTP request', async () => {
  let calls = 0;
  const result = await loadGithubContext('No repo link.', frame, { fetcher: async () => { calls += 1; return jsonResponse({}); } });
  assert.equal(result.status, 'missing-repo-url');
  assert.equal(calls, 0);
});

test('fetches the selected public file and returns a 60-line window around the error', async () => {
  const source = Array.from({ length: 120 }, (_, index) => `line ${index + 1}`).join('\n');
  let request;
  const result = await loadGithubContext('Repo: https://github.com/acme/demo', frame, {
    fetcher: async (url, init) => {
      request = { url, init };
      return jsonResponse(contents(source));
    },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.startLine, 21);
  assert.equal(result.endLine, 80);
  assert.equal(result.snippet.split('\n').length, 60);
  assert.match(result.snippet, /line 50/);
  assert.match(request.url, /contents\/workspace\/project\/src\/app\.js$/);
  assert.equal(request.init.headers.authorization, undefined);
});

test('uses the repository tree once to resolve a mismatched absolute frame path by filename', async () => {
  const source = 'first\nsecond\nthird';
  const requested = [];
  const result = await loadGithubContext('https://github.com/acme/demo', frame, {
    fetcher: async (url) => {
      requested.push(url);
      if (url.includes('/contents/')) return requested.filter((entry) => entry.includes('/contents/')).length === 1
        ? jsonResponse({ message: 'Not Found' }, 404)
        : jsonResponse(contents(source, 'src/app.js'));
      if (url.endsWith('/repos/acme/demo')) return jsonResponse({ default_branch: 'main' });
      if (url.includes('/git/trees/main?recursive=1')) return jsonResponse({
        tree: [{ path: 'src/app.js', type: 'blob' }, { path: 'README.md', type: 'blob' }],
      });
      throw new Error(`Unexpected test request: ${url}`);
    },
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.filePath, 'src/app.js');
  assert.equal(requested.filter((url) => url.includes('/git/trees/')).length, 1);
});

test('distinguishes a private or missing repository from a missing file', async () => {
  let calls = 0;
  const result = await loadGithubContext('https://github.com/private/repo', frame, {
    fetcher: async () => {
      calls += 1;
      return jsonResponse({ message: 'Not Found' }, 404);
    },
  });
  assert.equal(result.status, 'private-or-not-found');
  assert.equal(calls, 2);
});

test('reports a missing file when the one recursive tree lookup finds no filename match', async () => {
  const result = await loadGithubContext('https://github.com/acme/demo', frame, {
    fetcher: async (url) => {
      if (url.includes('/contents/')) return jsonResponse({ message: 'Not Found' }, 404);
      if (url.endsWith('/repos/acme/demo')) return jsonResponse({ default_branch: 'main' });
      return jsonResponse({ tree: [{ path: 'README.md', type: 'blob' }] });
    },
  });
  assert.equal(result.status, 'file-not-found');
});

test('does not choose between duplicate filename matches', async () => {
  const result = await loadGithubContext('https://github.com/acme/demo', { ...frame, filePath: 'app.js' }, {
    fetcher: async (url) => {
      if (url.includes('/contents/')) return jsonResponse({ message: 'Not Found' }, 404);
      if (url.endsWith('/repos/acme/demo')) return jsonResponse({ default_branch: 'main' });
      return jsonResponse({ tree: [
        { path: 'src/app.js', type: 'blob' },
        { path: 'test/fixtures/app.js', type: 'blob' },
      ] });
    },
  });
  assert.equal(result.status, 'path-mismatch');
});

test('rejects source files over the configured cap before decoding', async () => {
  const result = await loadGithubContext('https://github.com/acme/demo', frame, {
    maxFileBytes: 20,
    fetcher: async () => jsonResponse({ type: 'file', size: 21, encoding: 'base64', content: '' }),
  });
  assert.equal(result.status, 'file-too-large');
});

test('reports rate limits, forbidden requests, and network errors without throwing', async () => {
  const rateLimited = await loadGithubContext('https://github.com/acme/demo', frame, {
    fetcher: async () => jsonResponse({ message: 'limit' }, 403, { 'x-ratelimit-remaining': '0' }),
  });
  const forbidden = await loadGithubContext('https://github.com/acme/demo', frame, {
    fetcher: async () => jsonResponse({ message: 'forbidden' }, 403, { 'x-ratelimit-remaining': '3' }),
  });
  const failed = await loadGithubContext('https://github.com/acme/demo', frame, {
    fetcher: async () => { throw new Error('network down'); },
  });
  assert.equal(rateLimited.status, 'rate-limited');
  assert.match(rateLimited.message, /rate-limiting/i);
  assert.equal(forbidden.status, 'forbidden');
  assert.equal(failed.status, 'request-failed');
});

test('handles a direct 429 response and invalid stack frame paths', async () => {
  const rateLimited = await loadGithubContext('https://github.com/acme/demo', frame, {
    fetcher: async () => jsonResponse({ message: 'slow down' }, 429),
  });
  const invalidPath = await loadGithubContext('https://github.com/acme/demo', { ...frame, filePath: '' });
  assert.equal(rateLimited.status, 'rate-limited');
  assert.equal(invalidPath.status, 'invalid-frame-path');
});

test('bounds each GitHub request and returns a status when the network stalls', async () => {
  let calls = 0;
  const result = await loadGithubContext('https://github.com/acme/demo', frame, {
    requestTimeoutMs: 2,
    fetcher: (_url, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('request timed out')));
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'request-failed');
});
