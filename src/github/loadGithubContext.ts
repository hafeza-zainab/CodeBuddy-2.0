import type { StackFrame } from '../parser/parseStackTrace';
import { GITHUB_REQUEST_TIMEOUT_MS } from '../services/analysisBudget';

export type GithubContextStatus =
  | 'ok'
  | 'missing-repo-url'
  | 'invalid-repo-url'
  | 'invalid-frame-path'
  | 'private-or-not-found'
  | 'file-not-found'
  | 'path-mismatch'
  | 'file-too-large'
  | 'rate-limited'
  | 'forbidden'
  | 'request-failed';

export interface GithubContextResult {
  status: GithubContextStatus;
  message: string;
  repoUrl?: string;
  filePath?: string;
  snippet?: string;
  startLine?: number;
  endLine?: number;
}

export interface GithubContextOptions {
  fetcher?: typeof fetch;
  maxFileBytes?: number;
  windowLines?: number;
  requestTimeoutMs?: number;
}

interface RepoReference {
  owner: string;
  repo: string;
  url: string;
  branch?: string;
}

interface ApiResponse<T> {
  response: Response;
  data: T | null;
}

interface ContentsPayload {
  type?: string;
  size?: number;
  encoding?: string;
  content?: string;
}

interface RepositoryPayload {
  default_branch?: string;
}

interface TreePayload {
  tree?: Array<{ path?: string; type?: string; size?: number }>;
  truncated?: boolean;
}

const API_ROOT = 'https://api.github.com';
const MAX_FILE_BYTES = 100 * 1024;
const WINDOW_LINES = 60;

/** Find the first GitHub repository URL embedded anywhere in issue text. */
export function findGithubRepository(issueText: unknown): RepoReference | null {
  if (typeof issueText !== 'string') return null;
  const pattern = /https?:\/\/(?:www\.)?github\.com\/([^/\s?#]+)\/([^/\s?#]+)(?:\/tree\/([^/\s?#]+)(?:\/([^\s?#]*))?)?/gi;
  const match = pattern.exec(issueText);
  if (!match) return null;

  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '').replace(/[),.;!]+$/g, '');
  const branch = match[3];
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || repo === '.' || repo === '..') {
    return null;
  }
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
    branch,
  };
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/[?#].*$/, '')
    .replace(/^\/+/, '')
    .replace(/^(?:\.\/)+/, '');
}

function basename(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).pop() ?? '';
}

function encodePath(path: string): string {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function requestMessage(status: GithubContextStatus): string {
  const messages: Record<GithubContextStatus, string> = {
    ok: 'Source context loaded.',
    'missing-repo-url': 'No public GitHub repository link was found in the issue text.',
    'invalid-repo-url': 'The GitHub repository link in the issue is not a valid owner/repository URL.',
    'invalid-frame-path': 'The selected stack frame does not include a usable source file path.',
    'private-or-not-found': 'GitHub could not find a public repository at that URL; it may be private or the link may be incorrect.',
    'file-not-found': 'The selected frame file could not be found in the linked repository.',
    'path-mismatch': 'Several repository files match the frame name, so source context was not selected automatically.',
    'file-too-large': 'The selected source file exceeds the size limit for safe context loading.',
    'rate-limited': 'GitHub is rate-limiting unauthenticated requests. Try again later; hints remain available without repository context.',
    forbidden: 'GitHub denied access to this repository request.',
    'request-failed': 'GitHub could not be reached. Hints remain available without repository context.',
  };
  return messages[status];
}

function result(status: GithubContextStatus, extras: Partial<GithubContextResult> = {}): GithubContextResult {
  return { status, message: requestMessage(status), ...extras };
}

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  let data: T | null = null;
  try {
    data = await response.json() as T;
  } catch {
    // GitHub can return an empty body for some failures; status handling below is sufficient.
  }
  return { response, data };
}

function classifyFailure(response: Response): GithubContextStatus {
  if (response.status === 404) return 'private-or-not-found';
  if (response.status === 429) return 'rate-limited';
  if (response.status === 403) {
    return response.headers.get('x-ratelimit-remaining') === '0' ? 'rate-limited' : 'forbidden';
  }
  return 'request-failed';
}

async function fetchJson<T>(fetcher: typeof fetch, url: string, timeoutMs: number): Promise<ApiResponse<T> | null> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });

  const request = (async () => {
    const response = await fetcher(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'CodeBuddy-2.0-for-Jira',
      },
    });
    return await readApiResponse<T>(response);
  })();

  try {
    return await Promise.race([request, timeout]);
  } catch {
    return null;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function decodeBase64(content: string): string | null {
  try {
    const binary = atob(content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function trimSource(source: string, errorLine: number, requestedWindow: number): { snippet: string; startLine: number; endLine: number } {
  const lines = source.split(/\r?\n/);
  const windowSize = Math.max(1, Math.min(120, Math.floor(requestedWindow)));
  const line = Math.max(1, Math.floor(errorLine));
  let startLine = Math.max(1, line - Math.floor((windowSize - 1) / 2));
  let endLine = Math.min(lines.length, startLine + windowSize - 1);
  if (endLine - startLine + 1 < windowSize) startLine = Math.max(1, endLine - windowSize + 1);
  endLine = Math.min(lines.length, startLine + windowSize - 1);
  return { snippet: lines.slice(startLine - 1, endLine).join('\n'), startLine, endLine };
}

function findMatchingTreePath(paths: string[], tracePath: string): string | null | 'ambiguous' {
  const normalizedTrace = normalizePath(tracePath).toLowerCase();
  const suffixMatches = paths.filter((path) => {
    const normalized = normalizePath(path).toLowerCase();
    return normalized === normalizedTrace || normalizedTrace.endsWith(`/${normalized}`) || normalized.endsWith(`/${normalizedTrace}`);
  });
  if (suffixMatches.length === 1) return suffixMatches[0];
  if (suffixMatches.length > 1) return 'ambiguous';

  const fileName = basename(tracePath).toLowerCase();
  const fileMatches = paths.filter((path) => basename(path).toLowerCase() === fileName);
  if (fileMatches.length === 1) return fileMatches[0];
  return fileMatches.length > 1 ? 'ambiguous' : null;
}

async function fetchContents(
  fetcher: typeof fetch,
  owner: string,
  repo: string,
  path: string,
  ref: string | undefined,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ source?: string; status?: GithubContextStatus }> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const url = `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}${query}`;
  const apiResponse = await fetchJson<ContentsPayload>(fetcher, url, timeoutMs);
  if (!apiResponse) return { status: 'request-failed' };
  if (!apiResponse.response.ok) return { status: classifyFailure(apiResponse.response) };

  const payload = apiResponse.data;
  if (payload?.type !== 'file' || typeof payload.content !== 'string' || payload.encoding !== 'base64') {
    return { status: 'request-failed' };
  }
  if (typeof payload.size === 'number' && payload.size > maxBytes) return { status: 'file-too-large' };
  const source = decodeBase64(payload.content);
  if (source === null) return { status: 'request-failed' };
  if (new TextEncoder().encode(source).byteLength > maxBytes) return { status: 'file-too-large' };
  return { source };
}

/**
 * Fetch one public repository file for the selected stack frame. This function
 * never throws on network, GitHub status, size, or decoding failures.
 */
export async function loadGithubContext(
  issueText: unknown,
  frame: StackFrame | null | undefined,
  options: GithubContextOptions = {},
): Promise<GithubContextResult> {
  if (typeof issueText !== 'string' || !issueText.trim()) return result('missing-repo-url');
  const repository = findGithubRepository(issueText);
  if (!repository) return result(/github\.com/i.test(issueText) ? 'invalid-repo-url' : 'missing-repo-url');
  if (!frame?.filePath?.trim() || !Number.isFinite(frame.line) || frame.line < 1) {
    return result('invalid-frame-path', { repoUrl: repository.url });
  }

  const fetcher = options.fetcher ?? fetch;
  const maxBytes = options.maxFileBytes ?? MAX_FILE_BYTES;
  const windowLines = options.windowLines ?? WINDOW_LINES;
  const requestTimeoutMs = options.requestTimeoutMs ?? GITHUB_REQUEST_TIMEOUT_MS;
  const firstPath = normalizePath(frame.filePath);
  const initial = await fetchContents(fetcher, repository.owner, repository.repo, firstPath, repository.branch, maxBytes, requestTimeoutMs);
  let source = initial.source;
  let selectedPath = firstPath;

  if (initial.status === 'private-or-not-found') {
    // A content 404 can mean either an absent file or a private/missing repo.
    // Resolve the public repo once before using the tree endpoint for path matching.
    const repoResult = await fetchJson<RepositoryPayload>(
      fetcher,
      `${API_ROOT}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`,
      requestTimeoutMs,
    );
    if (!repoResult) return result('request-failed', { repoUrl: repository.url });
    if (!repoResult.response.ok) {
      return result(classifyFailure(repoResult.response), { repoUrl: repository.url });
    }

    const branch = repository.branch ?? repoResult.data?.default_branch;
    if (!branch) return result('request-failed', { repoUrl: repository.url });
    const treeResult = await fetchJson<TreePayload>(
      fetcher,
      `${API_ROOT}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      requestTimeoutMs,
    );
    if (!treeResult) return result('request-failed', { repoUrl: repository.url });
    if (!treeResult.response.ok) return result(classifyFailure(treeResult.response), { repoUrl: repository.url });

    const paths = (treeResult.data?.tree ?? [])
      .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
      .map((entry) => entry.path as string);
    const match = findMatchingTreePath(paths, frame.filePath);
    if (match === 'ambiguous') return result('path-mismatch', { repoUrl: repository.url });
    if (!match) return result('file-not-found', { repoUrl: repository.url });

    selectedPath = match;
    const retry = await fetchContents(fetcher, repository.owner, repository.repo, selectedPath, branch, maxBytes, requestTimeoutMs);
    if (!retry.source) return result(retry.status ?? 'request-failed', { repoUrl: repository.url, filePath: selectedPath });
    source = retry.source;
  } else if (!source) {
    return result(initial.status ?? 'request-failed', { repoUrl: repository.url });
  }

  const trimmed = trimSource(source, frame.line, windowLines);
  return result('ok', {
    repoUrl: repository.url,
    filePath: selectedPath,
    ...trimmed,
  });
}
