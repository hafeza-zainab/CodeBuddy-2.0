import { ISSUE_REQUEST_TIMEOUT_MS, MAX_ISSUE_COMMENT_PAGES } from './analysisBudget';

export type JiraRequest = (uri: string, options?: RequestInit) => Promise<Response>;

export interface IssueTextResult {
  text: string;
  warning?: string;
}

export interface IssueTextOptions {
  requestTimeoutMs?: number;
  maxCommentPages?: number;
}

interface JiraIssueResponse {
  fields?: { description?: unknown };
}

interface AdfMark {
  type?: string;
  attrs?: { href?: unknown };
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: unknown[];
  marks?: AdfMark[];
  attrs?: { text?: unknown; url?: unknown };
}

interface JiraCommentPage {
  comments?: Array<{ body?: unknown }>;
  startAt?: number;
  maxResults?: number;
  total?: number;
}

const COMMENT_PAGE_SIZE = 100;

/**
 * Convert Jira's Atlassian Document Format (or plain text) into searchable text.
 * Block nodes get line breaks so separate code and paragraphs do not run together.
 */
export function adfToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(adfToText).join('');
  if (!value || typeof value !== 'object') return '';

  const node = value as AdfNode;
  if (node.type === 'text') {
    const visibleText = node.text ?? '';
    const linkMark = node.marks?.find((mark) => mark.type === 'link');
    const href = typeof linkMark?.attrs?.href === 'string' ? linkMark.attrs.href : '';
    // Jira often stores a repository URL only in the hyperlink mark while
    // displaying friendly text such as “source repository” in the issue.
    return href && href !== visibleText ? `${visibleText} ${href}` : visibleText;
  }
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') {
    // Mentions are inline ADF nodes: their visible text lives in attrs.text,
    // not in a child text node. Keep it so nearby trace text stays intact.
    return typeof node.attrs?.text === 'string' ? node.attrs.text : '@unknown';
  }

  if (['inlineCard', 'blockCard', 'embedCard'].includes(node.type ?? '')) {
    // Jira smart links can store the only copy of a pasted URL in attrs.url.
    // Preserve it as ordinary text so repository discovery can find it.
    const url = typeof node.attrs?.url === 'string' ? node.attrs.url : '';
    return url ? `${url}${node.type === 'inlineCard' ? '' : '\n'}` : '';
  }

  const children = Array.isArray(node.content) ? node.content.map(adfToText).join('') : '';
  if (['paragraph', 'heading', 'codeBlock', 'blockquote', 'listItem'].includes(node.type ?? '')) {
    return `${children}\n`;
  }
  return children;
}

function requireSuccessfulResponse(response: Response, resource: string): void {
  if (!response.ok) {
    // Avoid exposing raw response bodies because they can contain issue data.
    throw new Error(`Jira could not read the ${resource} (HTTP ${response.status}).`);
  }
}

interface JiraJsonResponse<T> {
  response: Response;
  data: T | null;
}

/** Bound both the Jira request and response decoding so slow bodies cannot
 * consume the entire Forge invocation after the network headers arrive. */
function requestJiraJson<T>(requestJira: JiraRequest, uri: string, timeoutMs: number): Promise<JiraJsonResponse<T>> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Jira request timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  const request = (async () => {
    const response = await requestJira(uri, { signal: controller.signal });
    const data = response.ok ? await response.json() as T : null;
    return { response, data };
  })();

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

/** Read issue text through the current user's permissions within a bounded comment-page budget. */
export async function loadIssueText(
  issueKey: string,
  requestJira: JiraRequest,
  options: IssueTextOptions = {},
): Promise<IssueTextResult> {
  const safeIssueKey = issueKey.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(safeIssueKey)) {
    throw new Error('The Jira issue key is missing or invalid.');
  }

  const encodedKey = encodeURIComponent(safeIssueKey);
  const timeoutMs = Math.max(1, Math.floor(options.requestTimeoutMs ?? ISSUE_REQUEST_TIMEOUT_MS));
  const maxCommentPages = Math.max(1, Math.floor(options.maxCommentPages ?? MAX_ISSUE_COMMENT_PAGES));
  const issueResult = await requestJiraJson<JiraIssueResponse>(
    requestJira,
    `/rest/api/3/issue/${encodedKey}?fields=description`,
    timeoutMs,
  );
  const issueResponse = issueResult.response;
  requireSuccessfulResponse(issueResponse, 'issue description');
  const issue = issueResult.data ?? {};
  const parts = [adfToText(issue.fields?.description).trim()].filter(Boolean);

  let startAt = 0;
  let total = 0;
  let warning: string | undefined;
  let pagesRead = 0;
  do {
    const commentsUri = `/rest/api/3/issue/${encodedKey}/comment?startAt=${startAt}&maxResults=${COMMENT_PAGE_SIZE}`;
    try {
      const { response, data } = await requestJiraJson<JiraCommentPage>(requestJira, commentsUri, timeoutMs);
      if (!response.ok) {
        warning = `Jira returned HTTP ${response.status} while reading issue comments; the description was still analyzed.`;
        break;
      }
      const page = data ?? {};
      pagesRead += 1;
      const comments = page.comments ?? [];
      for (const comment of comments) {
        const text = adfToText(comment.body).trim();
        if (text) parts.push(text);
      }

      const actualStart = page.startAt ?? startAt;
      total = page.total ?? actualStart + comments.length;
      const nextStart = actualStart + comments.length;
      if (comments.length === 0 || nextStart <= startAt) break;
      startAt = nextStart;
      if (startAt < total && pagesRead >= maxCommentPages) {
        warning = `Only the first ${maxCommentPages * COMMENT_PAGE_SIZE} Jira comments were analyzed to stay within the Forge time budget.`;
        break;
      }
    } catch {
      warning = 'Jira could not load all comments; the available issue text was still analyzed.';
      break;
    }
  } while (startAt < total);

  return { text: parts.join('\n\n'), warning };
}
