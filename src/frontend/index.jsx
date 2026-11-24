import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  CodeBlock,
  Heading,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  useProductContext,
} from '@forge/react';
import { invoke, requestJira } from '@forge/bridge';
import { loadIssueText } from '../services/loadIssueText';
import { ANALYSIS_DEADLINE_MS } from '../services/analysisBudget';

/** Render fenced examples as native UI Kit code instead of showing Markdown syntax. */
function renderHint(value) {
  const fence = /```([A-Za-z0-9+#.-]*)\s*\n([\s\S]*?)```/g;
  const segments = [];
  let cursor = 0;
  let match;

  while ((match = fence.exec(value)) !== null) {
    if (match.index > cursor) segments.push({ text: value.slice(cursor, match.index).trim() });
    segments.push({ language: match[1] || 'text', code: match[2].replace(/\n$/, '') });
    cursor = fence.lastIndex;
  }

  if (segments.length === 0) return <Text>{value}</Text>;
  if (cursor < value.length) segments.push({ text: value.slice(cursor).trim() });

  return (
    <Stack space="space.100">
      {segments.map((segment, index) => (segment.code !== undefined
        ? <CodeBlock key={`code-${index}`} language={segment.language} text={segment.code} />
        : segment.text
          ? <Text key={`text-${index}`}>{segment.text}</Text>
          : null))}
    </Stack>
  );
}

/** Keep the view states explicit so a Jira or service failure never looks like an empty success. */
const App = () => {
  const productContext = useProductContext();
  const hasProductContext = Boolean(productContext);
  const issueContext = productContext?.extension?.issue;
  const issueKey = issueContext?.key ?? productContext?.extension?.issueKey;
  const [view, setView] = useState({ status: 'loading' });

  useEffect(() => {
    // Product context loads asynchronously in UI Kit. Wait until we know the
    // current issue before requesting any issue data from Jira.
    if (!hasProductContext) return undefined;
    if (typeof issueKey !== 'string' || !issueKey.trim()) {
      setView({ status: 'error', message: 'Jira did not provide the current issue key to this panel.' });
      return undefined;
    }

    let isCurrent = true;
    setView({ status: 'loading' });

    const load = async () => {
      const deadlineAt = Date.now() + ANALYSIS_DEADLINE_MS;
      try {
        // requestJira runs as the current Jira user, so Jira applies that
        // user's issue visibility and Browse Projects permissions.
        const issueContent = await loadIssueText(issueKey, requestJira, { deadlineAt });
        const analysis = await invoke('analyzeIssue', {
          issueText: issueContent.text,
          issueWarning: issueContent.warning,
          deadlineAt,
        });
        if (isCurrent) setView({ status: analysis.status, analysis });
      } catch (error) {
        if (isCurrent) {
          setView({
            status: 'error',
            message: error instanceof Error ? error.message : 'CodeBuddy could not read this Jira issue.',
          });
        }
      }
    };

    load();
    return () => {
      // Ignore a late result if Jira switches the issue while the request is running.
      isCurrent = false;
    };
  }, [hasProductContext, issueKey]);

  if (view.status === 'loading') {
    return (
      <Stack space="space.200">
        <Heading as="h3">CodeBuddy 2.0</Heading>
        <Spinner />
        <Text>Reading the Jira issue and checking for a stack trace…</Text>
      </Stack>
    );
  }

  if (view.status === 'error') {
    return (
      <Stack space="space.200">
        <Heading as="h3">CodeBuddy 2.0</Heading>
        <SectionMessage appearance="error" title="Could not analyze this issue">
          <Text>{view.message}</Text>
        </SectionMessage>
      </Stack>
    );
  }

  const { analysis } = view;
  if (analysis.status === 'no-trace') {
    return (
      <Stack space="space.200">
        <Heading as="h3">CodeBuddy 2.0</Heading>
        {analysis.issueWarning ? (
          <SectionMessage appearance="warning" title="Some issue comments were unavailable">
            <Text>{analysis.issueWarning}</Text>
          </SectionMessage>
        ) : null}
        <SectionMessage appearance="information" title="No stack trace found">
          <Text>{analysis.message}</Text>
        </SectionMessage>
      </Stack>
    );
  }

  const { trace, github, hints } = analysis;
  return (
    <Stack space="space.200">
      <Heading as="h3">CodeBuddy 2.0</Heading>
      <Text>
        {trace.language} · {trace.errorType}{trace.message ? `: ${trace.message}` : ''}
      </Text>
      {analysis.issueWarning ? (
        <SectionMessage appearance="warning" title="Some issue comments were unavailable">
          <Text>{analysis.issueWarning}</Text>
        </SectionMessage>
      ) : null}
      {github.status === 'ok' ? (
        <Text>Using {github.filePath} lines {github.startLine}–{github.endLine} from the linked public repository.</Text>
      ) : (
        <SectionMessage appearance="information" title="Repository context unavailable">
          <Text>{github.message} The hint templates still work without repository context.</Text>
        </SectionMessage>
      )}
      <Text>Hint source: {hints.source === 'ai' ? `AI (${hints.model ?? 'Gemini'})` : 'template fallback'}.</Text>
      {hints.source === 'template' && hints.fallbackReason ? (
        <Text size="small" color="color.text.subtle">Fallback reason: {hints.fallbackReason}</Text>
      ) : null}
      <Heading as="h4">1. Nudge</Heading>
      <Text>{hints.nudge}</Text>
      <Heading as="h4">2. Pointer</Heading>
      <Text>{hints.pointer}</Text>
      <Heading as="h4">3. Full fix</Heading>
      {renderHint(hints.fix)}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
