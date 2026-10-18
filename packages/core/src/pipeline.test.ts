/**
 * `AuditPipeline.run()` — the orchestration, end to end.
 *
 * This package's tests never touch the network, which until now meant `run()`
 * had no test at all: the history-scan loop, the `contentSkipped` count and
 * the `degraded` flag were reachable only through a real audit. Nothing in
 * `run()` does I/O itself — it calls four methods on the fetcher and one on
 * the metadata analyzer — so both are injectable (`PipelineOptions.fetcher`
 * and `.metadataAnalyzer`) and the whole path runs offline.
 *
 * The loop is why this file exists. It used to catch its failure *outside*
 * the loop, which threw away every commit already read: a rate limit on the
 * sixth of twenty commits reported `scannedCommits: 0` while the first five
 * had been fetched and their secrets discarded. The fix is four lines, and
 * without these tests nothing would notice if it came back.
 */
import { describe, expect, it } from 'vitest';
import {
  AuditPipeline,
  type PipelineFetcher,
  type PipelineInput,
  type PipelineMetadata,
  type PipelineOptions,
} from './pipeline.js';
import type { CommitFileChange, CommitRef, RepositoryContents } from './git/fetcher.js';
import type { FileEntry } from './git/files.js';
import type { RepoMetadata } from './analyzers/metadata.js';

const REPO_URL = 'https://github.com/acme/widget';

const METADATA: RepoMetadata = {
  owner: 'acme',
  name: 'widget',
  defaultBranch: 'main',
  license: 'MIT',
  lastUpdatedAt: '2026-01-01T00:00:00Z',
  visibility: 'public',
  archived: false,
  stars: 12,
  openIssues: 0,
  openPulls: 0,
  description: 'A widget.',
  primaryLanguage: 'TypeScript',
  url: REPO_URL,
};

const INPUT: PipelineInput = {
  repoUrl: REPO_URL,
  mode: 'full',
  target: 'production',
  outputLanguage: 'en',
  includeLaunchCopy: false,
};

// Built at runtime rather than written as a literal: GitHub's push protection
// rejects committed fixtures that look like live keys. Same value and same
// reason as `security/history-scanner.test.ts`.
const FAKE_AWS_KEY = 'AKIA' + 'Z3XJ7QW2PLK9MNV4';

/** A commit with a unique sha, distinct date, and no diff of its own. */
function commitAt(i: number): CommitRef {
  const sha = String(i).padStart(40, 'a');
  return {
    sha,
    subject: `commit ${i}`,
    date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    url: `${REPO_URL}/commit/${sha}`,
  };
}

/** A one-line addition, so the scanner has an added line to read. */
function diffAdding(line: string, filename = 'src/config.ts'): CommitFileChange {
  return {
    filename,
    status: 'modified',
    patch: ['@@ -1,1 +1,2 @@', ' const existing = true;', `+${line}`].join('\n'),
    additions: 1,
    deletions: 0,
  };
}

interface FakePlan {
  commits?: CommitRef[];
  /** Index in `commits` whose diff read throws, simulating a rate limit. */
  failReadAt?: number;
  /** Throw from `listCommits` itself, before any commit is read. */
  listError?: Error;
  /** Diff per sha. Anything not listed comes back as a harmless change. */
  diffs?: Map<string, CommitFileChange[]>;
  entries?: FileEntry[];
  contents?: Map<string, string>;
  degraded?: boolean;
}

class FakeFetcher implements PipelineFetcher {
  readonly readShas: string[] = [];
  listCalls = 0;

  constructor(private readonly plan: FakePlan = {}) {}

  async fetchTree(): Promise<{ entries: FileEntry[]; truncated: boolean }> {
    return { entries: this.plan.entries ?? [], truncated: false };
  }

  async fetchRepositoryContents(): Promise<RepositoryContents> {
    return {
      contents: this.plan.contents ?? new Map<string, string>(),
      source: this.plan.degraded ? 'per-file' : 'tarball',
      degraded: this.plan.degraded ?? false,
    };
  }

  async listCommits(): Promise<CommitRef[]> {
    this.listCalls += 1;
    if (this.plan.listError) throw this.plan.listError;
    return this.plan.commits ?? [];
  }

  async fetchCommitChanges(_owner: string, _repo: string, sha: string): Promise<CommitFileChange[]> {
    const at = (this.plan.commits ?? []).findIndex((c) => c.sha === sha);
    if (this.plan.failReadAt !== undefined && at === this.plan.failReadAt) {
      throw new Error('API rate limit exceeded');
    }
    this.readShas.push(sha);
    return this.plan.diffs?.get(sha) ?? [diffAdding('const ok = true;')];
  }
}

const fakeMetadata: PipelineMetadata = {
  async fetch() {
    return METADATA;
  },
};

function pipeline(
  opts: Omit<PipelineOptions, 'allowedHosts' | 'metadataAnalyzer'>
): AuditPipeline {
  return new AuditPipeline({
    allowedHosts: ['github.com'],
    metadataAnalyzer: fakeMetadata,
    ...opts,
  });
}

/** The findings the history scan produced, as opposed to the tree scan's. */
function historyFindings(report: { securityFindings: Array<{ id: string; title: string; evidence: Array<{ source?: string }> }> }) {
  return report.securityFindings.filter((f) => f.evidence.some((e) => e.source === 'git_history'));
}

describe('AuditPipeline.run', () => {
  it('keeps the commits it already read when a diff fails mid-loop', async () => {
    const commits = [0, 1, 2, 3, 4].map(commitAt);
    const diffs = new Map<string, CommitFileChange[]>([
      [commits[0]!.sha, [diffAdding(`const key = "${FAKE_AWS_KEY}";`)]],
    ]);
    const fetcher = new FakeFetcher({ commits, failReadAt: 2, diffs });

    const { report } = await pipeline({ fetcher, historyScanCommits: 5 }).run(INPUT);
    const scan = report.historyScan;

    // Two commits were read before the third failed, and the report says so
    // rather than claiming nothing was read.
    expect(scan?.mode).toBe('full');
    expect(scan?.requestedCommits).toBe(5);
    expect(scan?.scannedCommits).toBe(2);
    expect(scan?.complete).toBe(false);
    expect(scan?.note).toContain(commits[2]!.sha.slice(0, 7));
    expect(scan?.note).toContain('2 of 5 commits were read');

    // And the secret from the first commit is still reported. This is the
    // regression: with the failure caught outside the loop, the report said
    // `scannedCommits: 0` and this finding was gone — a secret that had been
    // fetched, scanned and found, discarded because a later commit failed.
    const found = historyFindings(report);
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toContain(commits[0]!.sha.slice(0, 7));
    expect(found[0]!.title).toContain('Secret in commit history');
  });

  it('stops reading at the failing commit instead of continuing past it', async () => {
    const commits = [0, 1, 2, 3, 4].map(commitAt);
    const fetcher = new FakeFetcher({ commits, failReadAt: 1 });

    await pipeline({ fetcher, historyScanCommits: 5 }).run(INPUT);

    // The two commits after the failure were never requested: the loop breaks,
    // so a rate limit costs one request rather than one per remaining commit.
    expect(fetcher.readShas).toEqual([commits[0]!.sha]);
  });

  it('reports an unreadable history as a scan that read nothing', async () => {
    const fetcher = new FakeFetcher({ listError: new Error('API rate limit exceeded') });

    const { report } = await pipeline({ fetcher, historyScanCommits: 5 }).run(INPUT);

    expect(report.historyScan).toEqual({
      mode: 'full',
      requestedCommits: 5,
      scannedCommits: 0,
      complete: false,
      note: 'commit history could not be read',
    });
  });

  it('calls completeness when it reached the beginning of history', async () => {
    // Asked for 5, found 3: the repository has no more commits, so the scan
    // really did see all of it.
    const fetcher = new FakeFetcher({ commits: [0, 1, 2].map(commitAt) });

    const { report } = await pipeline({ fetcher, historyScanCommits: 5 }).run(INPUT);

    expect(report.historyScan).toEqual({
      mode: 'full',
      requestedCommits: 5,
      scannedCommits: 3,
      complete: true,
      note: null,
    });
  });

  it('does not call completeness when it read exactly the depth it asked for', async () => {
    // Asked for 3, got 3: there may be more history below, and the report must
    // not imply it was examined.
    const fetcher = new FakeFetcher({ commits: [0, 1, 2].map(commitAt) });

    const { report } = await pipeline({ fetcher, historyScanCommits: 3 }).run(INPUT);

    expect(report.historyScan?.scannedCommits).toBe(3);
    expect(report.historyScan?.complete).toBe(false);
    expect(report.historyScan?.note).toBeNull();
  });

  it('does not ask the fetcher for anything when the scan is disabled', async () => {
    const fetcher = new FakeFetcher({ commits: [0, 1, 2].map(commitAt) });

    const { report } = await pipeline({ fetcher, historyScanCommits: 0 }).run(INPUT);

    expect(report.historyScan).toEqual({
      mode: 'disabled',
      requestedCommits: 0,
      scannedCommits: 0,
      complete: false,
      note: 'commit-history scanning is disabled',
    });
    // Zero cost, not just a zero result: a disabled scan is one GitHub request
    // the caller does not spend.
    expect(fetcher.listCalls).toBe(0);
  });

  it('derives the unread-content count as selected minus read', async () => {
    const entries: FileEntry[] = [
      { path: 'README.md', size: 100 },
      { path: 'src/index.ts', size: 200 },
    ];
    const fetcher = new FakeFetcher({
      entries,
      // One of the two selected files came back with no content.
      contents: new Map([['README.md', '# widget']]),
    });

    const { report } = await pipeline({ fetcher }).run(INPUT);

    const limitation = report.limitations.find((l) =>
      l.startsWith('Content was truncated out of this audit:')
    );
    expect(limitation).toContain('1 of 2 files');
  });

  it('carries the fetcher’s degraded flag through to the result and the report', async () => {
    const fetcher = new FakeFetcher({ degraded: true });

    const result = await pipeline({ fetcher }).run(INPUT);

    expect(result.degraded).toBe(true);
    expect(result.report.limitations.join('\n')).toContain(
      'files were fetched one at a time'
    );
  });
});
