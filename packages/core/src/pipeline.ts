/**
 * Pipeline orchestrator. Glue between:
 *   - URL parsing / host allowlist
 *   - GitHub tree + content fetcher
 *   - Analyzers + scoring
 *   - Report builder
 *
 * Callers (API, MCP) receive a `Report` they can validate with Zod and
 * return to the user.
 */
import { GitHubFetcher, parseRepoUrl, RepoFetchError, type FetchedRepo, type FileEntry } from './git/index.js';
import { filterFiles } from './git/files.js';
import { MetadataAnalyzer, type RepoMetadata } from './analyzers/metadata.js';
import { ReportBuilder } from './report/builder.js';
import {
  scanCommitsForSecrets,
  toHistoryFindings,
  type ScannedCommit,
} from './security/history-scanner.js';
import type { Finding, HistoryScan, Report } from './schemas/report.js';
import { DEFAULT_LIMITS } from './utils/constants.js';
import { withSpan } from './telemetry.js';
import type { Logger } from 'pino';

/**
 * The fetcher surface the pipeline uses.
 *
 * Structural rather than `GitHubFetcher` so a test can drive `run()` with a
 * fake and no network. Each method here is one HTTP call, and they are the
 * only four the pipeline makes.
 */
export type PipelineFetcher = Pick<
  GitHubFetcher,
  'fetchTree' | 'fetchRepositoryContents' | 'listCommits' | 'fetchCommitChanges'
>;

/** The metadata surface the pipeline uses. Same reason as `PipelineFetcher`. */
export type PipelineMetadata = Pick<MetadataAnalyzer, 'fetch'>;

export interface PipelineOptions {
  githubToken?: string;
  allowedHosts: string[];
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  /**
   * How many recent commits to read for the secret-history scan.
   * 0 disables it. Each commit costs one GitHub request.
   */
  historyScanCommits?: number;
  /**
   * Injection points for tests. Production callers omit both and get the
   * GitHub-backed implementations.
   *
   * They exist because this package's tests never touch the network, which
   * used to mean `run()` had no coverage at all: the history-scan loop, the
   * `contentSkipped` count and the `degraded` flag were all reachable only
   * through a real audit. Nothing here does I/O itself — the loop calls two
   * methods on the fetcher — so a fake makes the whole path offline.
   */
  fetcher?: PipelineFetcher;
  metadataAnalyzer?: PipelineMetadata;
  log?: Logger;
}

export interface PipelineInput {
  repoUrl: string;
  mode: 'quick' | 'full';
  target: 'hackathon' | 'open_source' | 'production';
  outputLanguage: 'en' | 'zh-CN';
  includeLaunchCopy: boolean;
}

export interface PipelineResult {
  report: Report;
  truncated: boolean;
  /**
   * True when the content was read a file at a time because the tarball
   * could not be read (ADR D-017). The report is still valid; the cost of
   * producing it was not — the request budget, not the bytes, is what
   * degraded.
   */
  degraded: boolean;
}

export class AuditPipeline {
  private opts: Required<
    Omit<PipelineOptions, 'log' | 'githubToken' | 'fetcher' | 'metadataAnalyzer'>
  > & {
    githubToken?: string;
    log?: Logger;
    fetcher?: PipelineFetcher;
    metadataAnalyzer?: PipelineMetadata;
  };

  constructor(opts: PipelineOptions) {
    this.opts = {
      githubToken: opts.githubToken,
      allowedHosts: opts.allowedHosts,
      maxFiles: opts.maxFiles ?? DEFAULT_LIMITS.maxFiles,
      maxFileBytes: opts.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes,
      maxTotalBytes: opts.maxTotalBytes ?? DEFAULT_LIMITS.maxTotalBytes,
      historyScanCommits: opts.historyScanCommits ?? DEFAULT_LIMITS.historyScanCommits,
      fetcher: opts.fetcher,
      metadataAnalyzer: opts.metadataAnalyzer,
      log: opts.log,
    };
  }

  /**
   * One audit, as one trace.
   *
   * The stages below are child spans rather than log lines because the
   * question a slow audit asks is "which stage", and the answer has to be
   * readable without correlating timestamps across three log files. The
   * pipeline span also carries the inputs, so a trace can be found by repo.
   */
  async run(input: PipelineInput): Promise<PipelineResult> {
    return withSpan(
      'audit.pipeline',
      {
        'repopilot.repo_url': input.repoUrl,
        'repopilot.mode': input.mode,
        'repopilot.target': input.target,
      },
      async (span) => {
        const result = await this.execute(input);
        span.setAttribute('repopilot.degraded', result.degraded);
        span.setAttribute('repopilot.truncated', result.truncated);
        return result;
      },
    );
  }

  private async execute(input: PipelineInput): Promise<PipelineResult> {
    const parsed = parseRepoUrl(input.repoUrl, this.opts.allowedHosts);
    const repoAttrs = { 'repopilot.owner': parsed.owner, 'repopilot.repo': parsed.repo };
    const metadataAnalyzer =
      this.opts.metadataAnalyzer ?? new MetadataAnalyzer({ token: this.opts.githubToken });
    const metadata: RepoMetadata = await withSpan('audit.metadata', repoAttrs, () =>
      metadataAnalyzer.fetch(parsed.owner, parsed.repo),
    );

    const fetcher = this.opts.fetcher ?? new GitHubFetcher(this.opts.githubToken);
    const { entries, truncated } = await withSpan('audit.tree', repoAttrs, () =>
      fetcher.fetchTree(parsed.owner, parsed.repo, metadata.defaultBranch),
    );

    const { included, skipped } = filterFiles(entries, {
      maxFiles: this.opts.maxFiles,
      maxFileBytes: this.opts.maxFileBytes,
    });

    // One request for the whole tree instead of one per file (ADR D-017).
    // `degraded` says the archive could not be read and the request-per-file
    // path ran instead — the state where the anonymous hourly budget still
    // applies, and therefore the one a caller needs to know about.
    const { contents, degraded } = await withSpan(
      'audit.contents',
      repoAttrs,
      async (span) => {
        const result = await fetcher.fetchRepositoryContents(
          parsed.owner,
          parsed.repo,
          metadata.defaultBranch,
          included,
          {
            maxFileBytes: this.opts.maxFileBytes,
            maxTotalBytes: this.opts.maxTotalBytes,
            log: (msg, meta) => this.opts.log?.debug({ msg, ...meta }, 'fetcher'),
          }
        );
        span.setAttribute('repopilot.files.read', result.contents.size);
        span.setAttribute('repopilot.degraded', result.degraded);
        return result;
      },
    );

    // Wanted paths that came back with no content. Both paths drop these
    // silently — `filterFiles` in `skipped`, `extractTarball` in
    // `missing` / `truncated` — and neither reached the report, so a gate
    // could say "no secrets found" about files it never opened. The count is
    // derivable from what the pipeline already has; `skipped.length` is not
    // it, because that includes binaries and noise directories that were
    // never candidates for reading.
    const contentSkipped = Math.max(0, included.length - contents.size);

    // Files the cap kept out of `included` entirely. They are not in
    // `contentSkipped` (which is measured against `included`), so before this
    // a 2 MiB `.env` appeared in no count at all: neither read, nor listed as
    // unread. `exceeds-max-files` counts too — the tree said the file exists
    // and the cap decided not to look. Binaries and noise directories are
    // excluded on purpose and are not findings sites, so they are not counted.
    const unreadableBeforeFetch = skipped.filter(
      (s) => s.reason === 'exceeds-max-file-bytes' || s.reason === 'exceeds-max-files'
    ).length;

    const history = await withSpan('audit.history', repoAttrs, async (span) => {
      const result = await this.scanHistory(fetcher, parsed.owner, parsed.repo, input.mode);
      span.setAttribute('repopilot.history.scanned', result.scan.scannedCommits);
      span.setAttribute('repopilot.history.complete', result.scan.complete);
      return result;
    });

    const builder = new ReportBuilder();
    const { report, truncated: reportTruncated } = await withSpan('audit.report', repoAttrs, () =>
      builder.build({
        metadata,
        entries: included as FileEntry[],
        // The unfiltered tree. `included` has had binaries removed, so any
        // "does this exist" check that reads it cannot see an image.
        allPaths: entries.map((e) => e.path),
        contents,
        truncated,
        auditMode: input.mode,
        target: input.target,
        outputLanguage: input.outputLanguage,
        includeLaunchCopy: input.includeLaunchCopy,
        historyFindings: history.findings,
        historyScan: history.scan,
        degraded,
        contentSkipped,
        unreadableBeforeFetch,
      }),
    );

    return { report, truncated: reportTruncated, degraded };
  }

  /**
   * Read recent commit diffs and look for credentials.
   *
   * Best-effort by design: a rate limit, a network blip or a repository
   * with no readable history must not fail an audit that otherwise
   * succeeded. Returns an empty list and logs the reason instead.
   */
  private async scanHistory(
    fetcher: PipelineFetcher,
    owner: string,
    repo: string,
    auditMode: 'quick' | 'full'
  ): Promise<{ findings: Finding[]; scan: HistoryScan }> {
    const depth = this.opts.historyScanCommits;

    if (depth <= 0) {
      return {
        findings: [],
        scan: {
          mode: 'disabled',
          requestedCommits: 0,
          scannedCommits: 0,
          complete: false,
          note: 'commit-history scanning is disabled',
        },
      };
    }

    try {
      const commits = await fetcher.listCommits(owner, repo, { limit: depth });

      // Read the commits one at a time and keep what was read.
      //
      // The failure used to be caught outside the loop, which threw away every
      // commit already in `scanned`: a rate limit on the sixth of twenty
      // commits reported `scannedCommits: 0` and a note saying history could
      // not be read, while the first five had been fetched and their secrets
      // discarded. A partial scan is worth reporting as a partial scan.
      const scanned: ScannedCommit[] = [];
      let stoppedAt: number | null = null;
      for (const [i, c] of commits.entries()) {
        try {
          const files = await fetcher.fetchCommitChanges(owner, repo, c.sha);
          scanned.push({ sha: c.sha, subject: c.subject, date: c.date, files });
        } catch (e) {
          this.opts.log?.warn(
            { err: (e as Error).message, sha: c.sha, owner, repo, scanned: scanned.length },
            'commit read failed; stopping history scan'
          );
          stoppedAt = i;
          break;
        }
      }

      return {
        findings: toHistoryFindings(scanCommitsForSecrets(scanned)),
        scan: {
          mode: auditMode,
          requestedCommits: depth,
          scannedCommits: scanned.length,
          // Asking for more commits than exist means we reached the
          // beginning of the repository: the coverage really is complete.
          // A stopped scan is not, however many commits it managed.
          complete: stoppedAt === null && commits.length < depth,
          note:
            stoppedAt === null
              ? null
              : `stopped at commit ${commits[stoppedAt]!.sha.slice(0, 7)}; ${scanned.length} of ` +
                `${commits.length} commits were read`,
        },
      };
    } catch (e) {
      this.opts.log?.warn(
        { err: (e as Error).message, owner, repo },
        'commit-history secret scan skipped'
      );
      return {
        findings: [],
        scan: {
          mode: auditMode,
          requestedCommits: depth,
          scannedCommits: 0,
          complete: false,
          note: 'commit history could not be read',
        },
      };
    }
  }
}

export { RepoFetchError, parseRepoUrl, GitHubFetcher };
export type { FetchedRepo, FileEntry };
