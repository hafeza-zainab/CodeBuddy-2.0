export type JiraRequest = (uri: string, options?: RequestInit) => Promise<Response>;

export interface IssueTextResult {
  text: string;
  warning?: string;
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
  attrs?: { text?: unknown };
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

/** Read the issue description and every comment through the current user's Jira permissions. */
export async function loadIssueText(issueKey: string, requestJira: JiraRequest): Promise<IssueTextResult> {
  const safeIssueKey = issueKey.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(safeIssueKey)) {
    throw new Error('The Jira issue key is missing or invalid.');
  }

  const encodedKey = encodeURIComponent(safeIssueKey);
  const issueResponse = await requestJira(`/rest/api/3/issue/${encodedKey}?fields=description`);
  requireSuccessfulResponse(issueResponse, 'issue description');
  const issue = await issueResponse.json() as JiraIssueResponse;
  const parts = [adfToText(issue.fields?.description).trim()].filter(Boolean);

  let startAt = 0;
  let total = 0;
  let warning: string | undefined;
  do {
    const commentsUri = `/rest/api/3/issue/${encodedKey}/comment?startAt=${startAt}&maxResults=${COMMENT_PAGE_SIZE}`;
    let response: Response;
    try {
      response = await requestJira(commentsUri);
      if (!response.ok) {
        warning = `Jira returned HTTP ${response.status} while reading issue comments; the description was still analyzed.`;
        break;
      }
      const page = await response.json() as JiraCommentPage;
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
    } catch {
      warning = 'Jira could not load all comments; the available issue text was still analyzed.';
      break;
    }
  } while (startAt < total);

  return { text: parts.join('\n\n'), warning };
}
