/**
 * Shared stack-trace parsing types. The frame list keeps the original order so
 * callers can display the complete trace, while `relevantFrame` points at the
 * most useful application frame for fetching source context.
 */
export type TraceLanguage = 'python' | 'javascript' | 'java';

export interface StackFrame {
  filePath: string;
  line: number;
  functionName: string | null;
}

export interface ParsedStackTrace {
  language: TraceLanguage;
  errorType: string;
  message: string;
  frames: StackFrame[];
  relevantFrame: StackFrame | null;
}

const PYTHON_FRAME = /File\s+["']([^"']+)["'],\s*line\s+(\d+)(?:,\s*in\s+([^\r\n]+?))?(?=\s|$)/g;
const JAVA_FRAME = /^\s*at\s+([\w.$<>/]+)\(([^():]+):(\d+)\)\s*$/;
const JAVA_MODULE_PREFIX = /^[\w.]+\/([\w.$]+)$/;
const JAVASCRIPT_AT_FRAME = /^\s*at\s+(.*?)\s+\((.+):(\d+):(\d+)\)\s*$/;
const JAVASCRIPT_PLAIN_FRAME = /^\s*at\s+(.+):(\d+):(\d+)\s*$/;
const BROWSER_FRAME = /^\s*(.*?)@(.+):(\d+):(\d+)\s*$/;
const ERROR_LINE = /^\s*(?:Uncaught\s+)?(?:Caused by:\s*)?(?:Exception in thread\s+["'][^"']+["']\s+)?([A-Za-z_$][\w.$]*(?:Error|Exception|Throwable|Failure|Fault|Interrupt|Exit))\s*(?::\s*(.*))?\s*$/;
const GENERIC_ERROR_LINE = /^\s*(?:Uncaught\s+)?(?:Caused by:\s*)?(?:Exception in thread\s+["'][^"']+["']\s+)?(Error|Exception)\s*:\s*(.*)$/;

/** Remove common wrappers while leaving source and traceback lines readable. */
function normalizeTraceText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/\{code(?::[^}]*)?\}/gi, '')
    .replace(/\[code(?:=[^\]]*)?\]/gi, '')
    .replace(/\[\/code\]/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

function normalizeJavaFunctionName(value: string): string {
  const moduleMatch = JAVA_MODULE_PREFIX.exec(value);
  return moduleMatch ? moduleMatch[1] : value;
}

function parseFrames(text: string): { language: TraceLanguage; frames: StackFrame[] } | null {
  const pythonFrames: StackFrame[] = [];
  for (const match of text.matchAll(PYTHON_FRAME)) {
    pythonFrames.push({
      filePath: match[1],
      line: Number(match[2]),
      functionName: match[3]?.trim() || null,
    });
  }
  if (pythonFrames.length > 0) return { language: 'python', frames: pythonFrames };

  const lines = text.split('\n');
  const javaFrames: StackFrame[] = [];
  for (const line of lines) {
    const match = JAVA_FRAME.exec(line);
    if (match) {
      javaFrames.push({
        filePath: match[2],
        line: Number(match[3]),
        functionName: normalizeJavaFunctionName(match[1]),
      });
    }
  }
  if (javaFrames.length > 0) return { language: 'java', frames: javaFrames };

  const javascriptFrames: StackFrame[] = [];
  for (const line of lines) {
    const named = JAVASCRIPT_AT_FRAME.exec(line);
    if (named) {
      javascriptFrames.push({
        filePath: named[2],
        line: Number(named[3]),
        functionName: named[1].trim() || null,
      });
      continue;
    }

    const plain = JAVASCRIPT_PLAIN_FRAME.exec(line);
    if (plain) {
      javascriptFrames.push({
        filePath: plain[1],
        line: Number(plain[2]),
        functionName: null,
      });
      continue;
    }

    const browser = BROWSER_FRAME.exec(line);
    if (browser) {
      javascriptFrames.push({
        filePath: browser[2],
        line: Number(browser[3]),
        functionName: browser[1].trim() || null,
      });
    }
  }
  return javascriptFrames.length > 0 ? { language: 'javascript', frames: javascriptFrames } : null;
}

function isFrameworkFrame(frame: StackFrame): boolean {
  const path = frame.filePath.replace(/\\/g, '/').toLowerCase();
  const functionName = frame.functionName?.toLowerCase() ?? '';
  return (
    path.includes('/node_modules/')
    || path.includes('/site-packages/')
    || path.includes('/dist-packages/')
    || path.includes('/.venv/')
    || path.includes('/vendor/')
    || functionName.startsWith('java.')
    || functionName.startsWith('java/')
    || functionName.startsWith('jdk.')
  );
}

function selectRelevantFrame(language: TraceLanguage, frames: StackFrame[], text: string): StackFrame | null {
  if (language === 'java') {
    const lines = text.split('\n');
    const deepestCauseLine = lines.reduce((last, line, index) => (line.includes('Caused by:') ? index : last), -1);
    if (deepestCauseLine >= 0) {
      for (const line of lines.slice(deepestCauseLine + 1)) {
        const match = JAVA_FRAME.exec(line);
        if (match) {
          const frame = {
            filePath: match[2],
            line: Number(match[3]),
            functionName: normalizeJavaFunctionName(match[1]),
          };
          if (!isFrameworkFrame(frame)) return frame;
        }
      }
    }
  }

  const appFrames = frames.filter((frame) => !isFrameworkFrame(frame));
  if (appFrames.length === 0) return null;
  // Python lists calls from outermost to innermost; JS and Java list the throw
  // site first. Pick the nearest application frame in each language's order.
  return language === 'python' ? appFrames[appFrames.length - 1] : appFrames[0];
}

function parseErrorLine(text: string): { errorType: string; message: string } | null {
  let lastMatch: { errorType: string; message: string } | null = null;
  for (const line of text.split('\n')) {
    const match = ERROR_LINE.exec(line) ?? GENERIC_ERROR_LINE.exec(line);
    if (match) {
      lastMatch = { errorType: match[1].split('.').pop() ?? match[1], message: (match[2] ?? '').trim() };
    }
  }
  return lastMatch;
}

function isStackFrameLine(line: string): boolean {
  return (
    /^\s*File\s+["'][^"']+["'],\s*line\s+\d+/.test(line)
    || JAVA_FRAME.test(line)
    || JAVASCRIPT_AT_FRAME.test(line)
    || JAVASCRIPT_PLAIN_FRAME.test(line)
    || BROWSER_FRAME.test(line)
  );
}

/**
 * Jira issues can accumulate several console pastes. Parse the latest complete
 * trace so its error line and relevant frame cannot accidentally come from
 * different incidents. Python exception chains use another traceback header;
 * Java `Caused by` entries remain part of the same trace and are handled below.
 */
function selectLatestTraceSegment(text: string): string {
  const lines = text.split('\n');
  const pythonStarts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*Traceback \(most recent call last\):\s*$/.test(lines[index])) pythonStarts.push(index);
  }
  if (pythonStarts.length > 1) return lines.slice(pythonStarts[pythonStarts.length - 1]).join('\n');

  const errorStarts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*Caused by:\s*/i.test(lines[index])) continue;
    if (ERROR_LINE.test(lines[index]) || GENERIC_ERROR_LINE.test(lines[index])) errorStarts.push(index);
  }

  const completeStarts = errorStarts.filter((start, candidateIndex) => {
    const nextStart = errorStarts[candidateIndex + 1] ?? lines.length;
    return lines.slice(start + 1, nextStart).some(isStackFrameLine);
  });
  if (completeStarts.length > 1) return lines.slice(completeStarts[completeStarts.length - 1]).join('\n');
  return text;
}

/**
 * Extract a Python, JavaScript/TypeScript, or Java trace from arbitrary issue
 * text. Non-traces return null so the caller can show its empty state cleanly.
 */
export function parseStackTrace(input: unknown): ParsedStackTrace | null {
  if (typeof input !== 'string' || !input.trim()) return null;

  const normalized = normalizeTraceText(input);
  const traceText = selectLatestTraceSegment(normalized);
  const parsedFrames = parseFrames(traceText);
  if (!parsedFrames) return null;

  const error = parseErrorLine(traceText);
  // A frame-only paste is still actionable; name it generically instead of
  // discarding the useful location information.
  const errorType = error?.errorType ?? 'Error';
  return {
    language: parsedFrames.language,
    errorType,
    message: error?.message ?? '',
    frames: parsedFrames.frames,
    relevantFrame: selectRelevantFrame(parsedFrames.language, parsedFrames.frames, traceText),
  };
}
