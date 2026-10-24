/**
 * The pipeline's spans, with the real `AuditPipeline` and fake I/O.
 *
 * The point is not that spans exist but that they are *children of the
 * pipeline span*: a stage that opens its own root trace would still be
 * exported, still look fine in a span list, and still be useless — you could
 * not tell which audit it belonged to.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { AuditPipeline } from '@repopilot/core';
import type {
  CommitFileChange,
  CommitRef,
  FileEntry,
  PipelineFetcher,
  RepoMetadata,
  RepositoryContents,
} from '@repopilot/core';
import { initTelemetry, type TelemetryHandle } from './telemetry.js';

const exporter = new InMemorySpanExporter();
let handle: TelemetryHandle;

beforeAll(() => {
  handle = initTelemetry({
    exporter: 'otlp',
    serviceName: 'repopilot-pipeline-test',
    spanExporter: exporter,
  });
});

const METADATA: RepoMetadata = {
  owner: 'acme',
  name: 'widget',
  defaultBranch: 'main',
  license: 'MIT',
  lastUpdatedAt: '2026-01-01T00:00:00Z',
  visibility: 'public',
  archived: false,
  stars: 1,
  openIssues: 0,
  openPulls: 0,
  description: null,
  primaryLanguage: 'TypeScript',
  url: 'https://github.com/acme/widget',
};

const fetcher: PipelineFetcher = {
  async fetchTree(): Promise<{ entries: FileEntry[]; truncated: boolean }> {
    return { entries: [{ path: 'README.md', size: 20 }], truncated: false };
  },
  async fetchRepositoryContents(): Promise<RepositoryContents> {
    return { contents: new Map([['README.md', '# Widget']]), source: 'tarball', degraded: false };
  },
  async listCommits(): Promise<CommitRef[]> {
    return [];
  },
  async fetchCommitChanges(): Promise<CommitFileChange[]> {
    return [];
  },
};

describe('AuditPipeline spans', () => {
  it('emits one child span per stage, all under the pipeline span', async () => {
    const pipeline = new AuditPipeline({
      allowedHosts: ['github.com'],
      fetcher,
      metadataAnalyzer: { fetch: async () => METADATA },
    });

    await pipeline.run({
      repoUrl: 'https://github.com/acme/widget',
      mode: 'full',
      target: 'production',
      outputLanguage: 'en',
      includeLaunchCopy: false,
    });

    await handle.flush();
    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'audit.pipeline');
    expect(root).toBeDefined();
    expect(root?.attributes['repopilot.repo_url']).toBe('https://github.com/acme/widget');
    expect(root?.attributes['repopilot.mode']).toBe('full');

    for (const stage of [
      'audit.metadata',
      'audit.tree',
      'audit.contents',
      'audit.history',
      'audit.report',
    ]) {
      const span = spans.find((s) => s.name === stage);
      expect(span, `${stage} was not emitted`).toBeDefined();
      expect(span?.parentSpanContext?.spanId, `${stage} is not a child of the pipeline span`).toBe(
        root?.spanContext().spanId,
      );
    }
  });
});
