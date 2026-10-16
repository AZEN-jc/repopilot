import { describe, expect, it } from 'vitest';
import type { RepoMetadata } from '../analyzers/metadata.js';
import type { HistoryScan, Report } from '../schemas/report.js';
import { ReportBuilder } from './builder.js';

const metadata: RepoMetadata = {
  owner: 'okx',
  name: 'repopilot',
  defaultBranch: 'main',
  license: 'MIT',
  lastUpdatedAt: '2026-01-01T00:00:00Z',
  visibility: 'public',
  archived: false,
  stars: 0,
  openIssues: 0,
  openPulls: 0,
  description: null,
  primaryLanguage: null,
  url: 'https://github.com/okx/repopilot',
};

function build(historyScan?: HistoryScan): Report {
  return new ReportBuilder().build({
    metadata,
    entries: [{ path: 'README.md', size: 50 }],
    contents: new Map([['README.md', '# Title']]),
    truncated: false,
    auditMode: 'quick',
    target: 'open_source',
    outputLanguage: 'en',
    includeLaunchCopy: false,
    ...(historyScan ? { historyScan } : {}),
  }).report;
}

function scopeLine(report: Report): string | undefined {
  return report.limitations.find((l) => l.includes('Commit history'));
}

describe('history scan scope', () => {
  it('states the scope when only recent history was read', () => {
    const report = build({
      mode: 'quick',
      requestedCommits: 20,
      scannedCommits: 20,
      complete: false,
      note: null,
    });
    expect(report.historyScan?.scannedCommits).toBe(20);
    expect(report.historyScan?.complete).toBe(false);
    expect(scopeLine(report)).toContain('20 commits only');
  });

  it('says nothing about a limited scope when the whole history was covered', () => {
    // Asked for 20, the repository only had 8: coverage really is complete.
    const report = build({
      mode: 'quick',
      requestedCommits: 20,
      scannedCommits: 8,
      complete: true,
      note: null,
    });
    expect(report.historyScan?.complete).toBe(true);
    expect(scopeLine(report)).toBeUndefined();
  });

  it('says so when the scan could not read history at all', () => {
    const report = build({
      mode: 'quick',
      requestedCommits: 20,
      scannedCommits: 0,
      complete: false,
      note: 'commit history could not be read',
    });
    expect(scopeLine(report)).toContain('was not scanned');
    expect(scopeLine(report)).toContain('could not be read');
  });

  it('handles a repository with no commits', () => {
    const report = build({
      mode: 'quick',
      requestedCommits: 20,
      scannedCommits: 0,
      complete: true,
      note: null,
    });
    expect(scopeLine(report)).toContain('was not scanned');
  });

  it('handles scanning being switched off', () => {
    const report = build({
      mode: 'disabled',
      requestedCommits: 0,
      scannedCommits: 0,
      complete: false,
      note: 'commit-history scanning is disabled',
    });
    expect(scopeLine(report)).toContain('disabled');
  });

  it('omits the field entirely when no scan was attempted', () => {
    const report = build(undefined);
    expect(report.historyScan).toBeUndefined();
    expect(scopeLine(report)).toBeUndefined();
  });

  it('records the mode it ran under', () => {
    const report = build({
      mode: 'full',
      requestedCommits: 100,
      scannedCommits: 100,
      complete: false,
      note: null,
    });
    expect(report.historyScan?.mode).toBe('full');
    expect(scopeLine(report)).toContain('100 commits only');
  });

  it('distinguishes a scan that stopped part-way from one that read only the most recent N', () => {
    // Reading fewer commits than were asked for is a failure mid-scan, not a
    // scope decision. The old wording ("the most recent 5 commits only")
    // reported it as though the boundary had been chosen — and the pipeline
    // used to throw away the commits it had already read when the scan
    // failed, so the report said 0 while five had been fetched and their
    // secrets discarded. `scannedCommits: 5` with a stop note is the honest
    // shape: the commits read are kept, and the note says where it stopped.
    const report = build({
      mode: 'quick',
      requestedCommits: 20,
      scannedCommits: 5,
      complete: false,
      note: 'stopped at commit abc1234; 5 of 20 commits were read',
    });
    expect(report.historyScan?.scannedCommits).toBe(5);
    expect(report.historyScan?.complete).toBe(false);
    const line = scopeLine(report);
    expect(line).toContain('5 of 20 requested commits');
    expect(line).toContain('stopped at commit abc1234');
    expect(line).not.toContain('most recent');
  });
});
