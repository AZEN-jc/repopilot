import { describe, it, expect } from 'vitest';
import { ReportBuilder } from '../report/builder.js';
import type { RepoMetadata } from '../analyzers/metadata.js';
import type { FileEntry } from '../git/files.js';
import type { Finding } from '../schemas/report.js';
import { makeFinding } from '../test-utils/report-factory.js';

function entry(path: string, size = 50): FileEntry {
  return { path, size };
}

const baseMetadata: RepoMetadata = {
  owner: 'okx',
  name: 'repopilot',
  defaultBranch: 'main',
  license: 'MIT',
  lastUpdatedAt: '2026-01-01T00:00:00Z',
  visibility: 'public',
  archived: false,
  stars: 12,
  openIssues: 0,
  openPulls: 0,
  description: 'Test repo',
  primaryLanguage: 'TypeScript',
  url: 'https://github.com/okx/repopilot',
};

/**
 * A repository with no critical/high findings at all.
 *
 * Shared because two very different questions need the same clean baseline:
 * "does a clean repo score well" and "when the report truncates a list, does it
 * say so" — the second needs a known blocker count, and any other finding
 * would make the total depend on the fixture rather than on the cap.
 */
function cleanRepo(): { entries: FileEntry[]; contents: Map<string, string> } {
  const entries: FileEntry[] = [
    entry('README.md'),
    entry('LICENSE'),
    entry('.env.example'),
    entry('.github/workflows/ci.yml'),
    entry('Dockerfile'),
    entry('package.json'),
    entry('pnpm-lock.yaml'),
    entry('src/index.ts'),
    entry('src/utils/logger.ts'),
    entry('docs/screenshot.png'),
  ];
  const contents = new Map<string, string>([
    ['README.md', '# Title\n## Install\n`pnpm install`\n## Run\n`pnpm dev`\n## Test\n`pnpm test`\nDemo: https://demo.example.com\n'],
    ['LICENSE', 'MIT License\n\nCopyright (c) 2026\n'],
    ['.env.example', 'API_KEY=\n'],
    ['.github/workflows/ci.yml', 'name: ci\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm test\n'],
    ['Dockerfile', 'FROM node:20\nCMD ["node", "dist/index.js"]\n'],
    ['package.json', JSON.stringify({ name: 'r', scripts: { dev: 'node', test: 'node test', start: 'node' } })],
    ['pnpm-lock.yaml', 'lockfileVersion: 9\n'],
    ['src/index.ts', 'export const x = 1;\n'],
    ['src/utils/logger.ts', 'export const y = 2;\n'],
  ]);
  return { entries, contents };
}

describe('ReportBuilder', () => {
  it('builds a complete report for a clean repo', () => {
    const { entries, contents } = cleanRepo();
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      auditMode: 'full',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: true,
    });
    expect(r.report.repository.owner).toBe('okx');
    expect(r.report.detectedStack).toContain('TypeScript');
    expect(r.report.detectedStack).toContain('Node.js');
    expect(r.report.detectedStack).toContain('Docker');
    expect(r.report.detectedStack).toContain('GitHub Actions');
    expect(r.report.scores.overall).toBeGreaterThan(80);
    expect(r.report.launchCopy.oneSentencePitch.length).toBeGreaterThan(0);
    expect(r.report.summary.length).toBeGreaterThan(0);
    expect(r.report.blockers).toEqual([]);
  });

  /**
   * R-58. The quality contract needs to know whether the files its rules read
   * exist at all, and the report is the only thing it is given. These two
   * cases pin the evidence: the manifest is listed, the lockfile is not
   * (a lockfile is not a manifest), and "none" is an empty list rather than
   * an absent field — absence means the report predates the field.
   */
  it('records which manifests the tree holds, and no lockfiles', () => {
    const { entries, contents } = cleanRepo();
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: false,
    });
    expect(r.report.manifests).toEqual(['package.json']);
    expect(r.report.manifests).not.toContain('pnpm-lock.yaml');
  });

  it('records an empty list when the tree holds no manifest at all', () => {
    const entries = [entry('README.md'), entry('LICENSE')];
    const contents = new Map<string, string>([
      ['README.md', '# Title\n'],
      ['LICENSE', 'MIT\n'],
    ]);
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: false,
    });
    expect(r.report.manifests).toEqual([]);
  });

  it('claims nothing about manifests when the listing was truncated', () => {
    // `[]` would say "the tree holds none", and a capped listing cannot
    // support that: the manifest may be in the part GitHub did not return.
    const entries = [entry('README.md'), entry('LICENSE')];
    const contents = new Map<string, string>([
      ['README.md', '# Title\n'],
      ['LICENSE', 'MIT\n'],
    ]);
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: true,
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: false,
    });
    expect(r.report.manifests).toBeUndefined();
  });

  it('flags missing README as a documentation gap', () => {
    const entries = [entry('package.json'), entry('LICENSE')];
    const contents = new Map<string, string>([
      ['package.json', JSON.stringify({ name: 'r' })],
      ['LICENSE', 'MIT\n'],
    ]);
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: false,
    });
    expect(r.report.documentationGaps.some((f) => f.id === 'doc-readme')).toBe(true);
  });

  it('does NOT include the actual secret value in the report', () => {
    const secret = 'sk_live_aaaaaaaaaaaaaaaaaaaaaa';
    const entries = [entry('README.md'), entry('package.json')];
    const contents = new Map<string, string>([
      ['README.md', '# Title\n'],
      ['package.json', `module.exports = { KEY: "${secret}" };\n`],
    ]);
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: false,
    });
    const json = JSON.stringify(r.report);
    expect(json.includes(secret)).toBe(false);
    expect(json.includes('sk_live_')).toBe(false);
  });

  it('produces a complete report with no provider to configure', () => {
    const entries = [entry('README.md'), entry('LICENSE'), entry('package.json')];
    const contents = new Map<string, string>([
      ['README.md', '# Title\n## Install\npnpm install\n## Test\npnpm test\nDemo: https://demo.example.com\n'],
      ['LICENSE', 'MIT\n'],
      ['package.json', JSON.stringify({ scripts: { test: 'echo' } })],
    ]);
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      // `full`, because this test is about the deterministic templates
      // filling every field, not about the tier. It used to run
      // as `quick` and assert the launch copy came out anyway — which is
      // what the tiering was supposed to prevent, and the only test that
      // would have noticed had it asserted the other direction. See
      // tiers.test.ts.
      auditMode: 'full',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: true,
    });
    expect(r.report.summary).not.toBe('');
    expect(r.report.launchCopy.oneSentencePitch).not.toBe('');
  });

  it('produces Chinese summary when language is zh-CN', () => {
    const entries = [entry('README.md'), entry('package.json')];
    const contents = new Map<string, string>([
      ['README.md', '# 标题\n'],
      ['package.json', JSON.stringify({ scripts: { test: 'echo' } })],
    ]);
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'zh-CN',
      includeLaunchCopy: true,
    });
    // Chinese characters present somewhere in summary
    expect(/[\u4e00-\u9fa5]/.test(r.report.summary)).toBe(true);
  });

  it('discloses files whose content could not be read', () => {
    // Both content paths drop files silently — `filterFiles` in `skipped`,
    // `extractTarball` in `missing` / `truncated` — and neither reached the
    // report, so "no secrets found" was indistinguishable from "no secrets
    // read". The one false negative a release gate must not be able to
    // produce quietly.
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries: [entry('README.md'), entry('src/huge-binary.ts')],
      contents: new Map([['README.md', '# Title\n']]),
      truncated: false,
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: true,
      contentSkipped: 1,
    });
    const line = r.report.limitations.find((l) => l.includes('Content was truncated'));
    expect(line).toBeDefined();
    expect(line).toContain('1 of 2');
  });

  it('stays quiet when every selected file was read', () => {
    // The complement: a clean audit must not grow a limitation nobody asked
    // for, and the coverage contract must not warn on it.
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries: [entry('README.md')],
      contents: new Map([['README.md', '# Title\n']]),
      truncated: false,
      auditMode: 'quick',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: true,
      contentSkipped: 0,
    });
    expect(
      r.report.limitations.some((l) => l.includes('Content was truncated')),
    ).toBe(false);
  });

  it('does not repeat a web3 finding in blockers or in the task list', () => {
    // `deploymentFindings` is built from `web3Findings.filter(...)`, and
    // `collectBlockers` was handed both — so every high-severity web3 finding
    // landed in `blockers` twice and, because `recommendedTasks` iterates
    // `blockers`, twice in the task list as well. On a web3 repository that
    // spent 25 slots on 12 findings.
    const entries: FileEntry[] = [
      entry('README.md'),
      entry('contracts/Token.sol'),
      entry('package.json'),
    ];
    const contents = new Map<string, string>([
      ['README.md', '# Token\n\nA token.\n'],
      ['contracts/Token.sol', 'pragma solidity ^0.8.0;\ncontract Token {}\n'],
      ['package.json', JSON.stringify({ name: 't', scripts: { test: 'node test' } })],
    ]);
    const r = new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      auditMode: 'full',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: false,
    });

    const ids = r.report.blockers.map((b) => b.id);
    expect(ids).toContain('web3-no-deploy-script');
    expect(new Set(ids).size).toBe(ids.length);

    const titles = r.report.recommendedTasks.map((t) => t.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

/**
 * The two capped lists, and what the report says about them (R-69).
 *
 * `collectBlockers` stops at 25 and `buildRecommendedTasks` at 12, and neither
 * used to say so. A repository with forty high findings read exactly like one
 * with twenty-five, and a reader who closed all twelve tasks believed the work
 * was done. These cases pin the disclosure and the order that makes the
 * truncated list a decision rather than an accident.
 */
describe('ReportBuilder — capped lists', () => {
  function historyHits(n: number, category: Finding['category'] = 'security'): Finding[] {
    return Array.from({ length: n }, (_, i) =>
      makeFinding({
        // Ids chosen so a sort by id is the reverse of the array order: the
        // determinism case below reverses the input and expects the same list.
        id: `secret-history-k${String(n - i).padStart(3, '0')}`,
        category,
        severity: 'high',
        title: `history hit ${i}`,
      })
    );
  }

  function buildWith(findings: Finding[]) {
    const { entries, contents } = cleanRepo();
    return new ReportBuilder().build({
      metadata: baseMetadata,
      entries,
      contents,
      truncated: false,
      auditMode: 'full',
      target: 'open_source',
      outputLanguage: 'en',
      includeLaunchCopy: false,
      historyFindings: findings,
    }).report;
  }

  it('says how many blockers it left out', () => {
    const report = buildWith(historyHits(40));

    // The premise: the clean fixture contributes no blockers of its own, so the
    // population is exactly the forty findings handed in.
    expect(report.blockers).toHaveLength(25);
    const sentence = report.limitations.find((l) => l.includes('critical/high findings'));
    expect(sentence).toContain('top 25 of 40');
    expect(sentence).toContain('counted in the score but are not listed here');
  });

  it('says how many blockers have no recommended task', () => {
    const report = buildWith(historyHits(40));
    expect(report.recommendedTasks).toHaveLength(12);
    expect(
      report.limitations.some((l) =>
        l.includes('cover the first 12 of the 25 findings listed as blockers')
      )
    ).toBe(true);
  });

  it('says nothing when nothing was left out', () => {
    // The note must be a fact about this report, not a standing disclaimer: a
    // report with three blockers has no truncation to disclose, and a permanent
    // sentence would train readers to ignore the one that matters.
    const report = buildWith(historyHits(3));
    expect(report.blockers).toHaveLength(3);
    expect(report.limitations.some((l) => l.includes('critical/high findings'))).toBe(false);
    expect(report.limitations.some((l) => l.includes('no task row'))).toBe(false);
  });

  it('keeps the same 25 whichever order the findings arrive in', () => {
    // The sort used to be severity-only, so which 25 survived was whatever
    // order the analyzers happened to emit. Two runs over one repository could
    // list different findings, and a reader had no way to know the list was a
    // sample.
    const forward = buildWith(historyHits(40));
    const backward = buildWith([...historyHits(40)].reverse());
    expect(backward.blockers.map((b) => b.id)).toEqual(forward.blockers.map((b) => b.id));
  });

  it('puts security ahead of documentation at the same severity', () => {
    // The category order is the product decision R-69 said it was. Stated as
    // behaviour rather than as a constant, so reordering the ranks has to be a
    // deliberate edit here too.
    const report = buildWith([
      makeFinding({
        id: 'doc-aaa',
        category: 'documentation',
        severity: 'high',
        title: 'a documentation gap',
      }),
      makeFinding({
        id: 'secret-zzz',
        category: 'security',
        severity: 'high',
        title: 'a committed credential',
      }),
    ]);
    expect(report.blockers.map((b) => b.id)).toEqual(['secret-zzz', 'doc-aaa']);
  });

  it('still puts a critical finding ahead of a high one, whatever the category', () => {
    const report = buildWith([
      makeFinding({ id: 'secret-aaa', category: 'security', severity: 'high', title: 'high' }),
      makeFinding({
        id: 'hack-zzz',
        category: 'hackathon',
        severity: 'critical',
        title: 'critical',
      }),
    ]);
    expect(report.blockers.map((b) => b.id)).toEqual(['hack-zzz', 'secret-aaa']);
  });
});
