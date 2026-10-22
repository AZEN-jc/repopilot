/**
 * Report builder — orchestrates every analyzer, computes scores, builds the
 * launch copy, and returns a `Report` that is fully Zod-validatable.
 *
 * This module is the only place where `Report` is constructed. Everything
 * downstream consumes the validated output.
 */
import type { RepoMetadata } from '../analyzers/metadata.js';
import { analyzeDocumentation, type DocAnalysis } from '../analyzers/documentation.js';
import { analyzeReproducibility, type ReproAnalysis } from '../analyzers/reproducibility.js';
import { detectStack, stackLabels, type StackSignal } from '../analyzers/stack.js';
import { analyzeWeb3, type Web3Analysis } from '../analyzers/web3.js';
import { analyzeHackathon, type HackathonAnalysis } from '../analyzers/hackathon.js';
import { analyzeAiPatterns } from '../analyzers/ai-patterns.js';
import { analyzeHygiene } from '../analyzers/hygiene.js';
import { enrichFindings } from '../findings/enrich.js';
import { isFixturePath } from '../security/severity.js';
import { groupFindings } from './fixtures.js';
import { condenseEvidence } from './evidence-lines.js';
import { scanForSecrets, toSecretFindings } from '../security/secret-scanner.js';
import { detectPromptInjection, injectionFindingsToReport } from '../security/injection.js';
import { scoreAll, type ScoringInput } from '../scoring/score.js';
import type {
  DeploymentStep,
  Finding,
  HistoryScan,
  LaunchChecklistItem,
  Report,
  Task,
} from '../schemas/report.js';
import type { FileEntry } from '../git/files.js';
import { templateLaunchCopy, templateSummary } from './templates.js';
import { REPORT_VERSION } from '../utils/constants.js';
import { isManifestPath } from '../utils/paths.js';
import { omittedSections, tierLimitations } from './tiers.js';

export interface ReportBuilderInput {
  metadata: RepoMetadata;
  entries: FileEntry[];
  /**
   * Every path in the tree, including the ones `filterFiles` dropped.
   *
   * `entries` is the filtered set: text files, under the size caps. That is
   * the right input for anything that reads content and the wrong input for
   * "does a file called X exist", because `filterFiles` removes binaries —
   * and a screenshot is a binary. Feeding existence checks the filtered set
   * is how the screenshot check became a question that could only ever be
   * answered "no".
   *
   * Defaults to `entries` when absent, so a caller that has no fuller list
   * still behaves as it did before.
   */
  allPaths?: string[];
  contents: Map<string, string>;
  truncated: boolean;
  auditMode: 'quick' | 'full';
  target: 'hackathon' | 'open_source' | 'production';
  outputLanguage: 'en' | 'zh-CN';
  includeLaunchCopy: boolean;
  /**
   * Findings from the commit-history scan. The pipeline owns that scan
   * because it needs network access; the builder only folds the results
   * into the security findings.
   */
  historyFindings?: Finding[];
  /** Scope of the history scan that produced those findings. */
  historyScan?: HistoryScan;
  /**
   * True when the content was read a file at a time because the tarball
   * could not be read (ADR D-017). The report is the same either way, so
   * this is stated in `limitations` rather than changing any finding: the
   * thing that degraded is how much of GitHub's request budget the audit
   * cost, not what it saw.
   */
  degraded?: boolean;
  /**
   * How many of the files selected for analysis could not be read.
   *
   * Both content paths drop files silently today: `filterFiles` records them
   * in `skipped` and `extractTarball` in `missing` / `truncated`, and neither
   * reaches the report. The caller derives this as `included.length -
   * contents.size`, which needs no new plumbing and covers both paths. Without
   * it, "no secrets found" is indistinguishable from "no secrets read" — the
   * one false negative a release gate must not be able to produce quietly.
   */
  contentSkipped?: number;
  /**
   * How many files the tree listed that were never candidates for reading
   * because of a cap — `exceeds-max-file-bytes` or `exceeds-max-files`.
   *
   * Separate from `contentSkipped`, which counts files that *were* selected
   * and then could not be read. Both end in "nobody looked at this file", and
   * only together do they make the coverage limitation true: a 2 MiB `.env`
   * full of credentials was dropped before selection and appeared in no count
   * at all, so the report could say "no secrets found" about a file it never
   * opened and never mentioned. Binary and noise-directory exclusions are not
   * counted here — those are deliberate and are not plausible finding sites.
   */
  unreadableBeforeFetch?: number;
}

export interface ReportBuilderResult {
  report: Report;
  truncated: boolean;
}

export class ReportBuilder {
  build(input: ReportBuilderInput): ReportBuilderResult {
    const stackSignals = detectStack(input.entries, input.contents);
    const labels = stackLabels(stackSignals);
    // Existence checks get the unfiltered tree; content checks get
    // `contents`. See `ReportBuilderInput.allPaths`.
    const allPaths = input.allPaths ?? input.entries.map((e) => e.path);
    const doc = analyzeDocumentation(allPaths, input.contents);
    const repro = analyzeReproducibility(allPaths, input.contents);
    const web3 = analyzeWeb3(input.entries, input.contents);
    const hackathon = analyzeHackathon(
      allPaths,
      input.contents,
      web3.chains,
      web3.contractAddresses
    );
    const secretDrafts = scanForSecrets(
      [...input.contents.entries()].map(([p, c]) => ({ path: p, content: c }))
    );
    const secretFindings = toSecretFindings(secretDrafts);
    // The identities of the secret findings, captured before the split.
    //
    // The launch checklist used to be handed `secretFindings` itself — the
    // array that went *into* `split()` — while the score, the blockers and the
    // quality contract all read the array that came out. A fixture credential
    // under `src/**/*.test.ts` therefore made the checklist report "No
    // committed credentials: not met" while `security.no-secrets` in the same
    // report said `pass`. One report, two answers, and the checklist is the one
    // a human reads (R-68).
    //
    // By id rather than by `id.startsWith('secret-')`, because `securityFindings`
    // also carries `secret-history-*` rows, and "a credential appears in this
    // repository's history" is a different claim from "no committed
    // credentials" — a prefix match would quietly merge the two.
    const secretFindingIds = new Set(secretFindings.map((f) => f.id));
    const hygiene = analyzeHygiene(input.entries, input.contents);
    const aiPatterns = analyzeAiPatterns(input.entries, input.contents);
    const injectionFindings = injectionFindingsToReport(
      detectPromptInjection(
        [...input.contents.entries()].map(([p, c]) => ({ path: p, content: c }))
      )
    );

    // Enrich once, at the source. Every downstream consumer — fix plans,
    // diffs, the quality contract, MCP — reads findings from here, so
    // this is the single place a finding acquires its ruleId, confidence,
    // verification and fingerprint.
    //
    // Every set is then split by where the finding lives. A finding in a
    // test file or a fixture is still real — it just does not get a vote
    // on the release by default. Dropping it would hide a genuine
    // credential committed into a test suite; leaving it in drowns the
    // report, which a real run demonstrated with 542 of them.
    //
    // Lockfiles and documents are handled one layer down, in
    // `severityForPath`, which downgrades rather than moves them. A
    // document is a poor fit for this split: a missing README is a real
    // repository gap whose evidence file happens to be `README.md`, and
    // filing that here would quietly drop it from the main report.
    const fixtureFindings: Finding[] = [];
    const split = (list: Finding[]): Finding[] =>
      list.filter((f) => {
        if (isFixturePath(f.evidence[0]?.file ?? '')) {
          fixtureFindings.push(f);
          return false;
        }
        return true;
      });

    const docFindings = split(enrichFindings(doc.findings));
    const allReproFindings = split(enrichFindings(repro.findings));
    const web3Findings = split(enrichFindings(web3.findings));
    const hackathonFindings = split(enrichFindings(hackathon.findings));
    const securityFindings = split(
      enrichFindings([
        ...secretFindings,
        ...injectionFindings,
        ...(input.historyFindings ?? []),
        ...hygiene.findings.filter((f) => f.category === 'security'),
      ])
    );
    // Code hygiene, not launch readiness: kept out of the score but still
    // visible to the quality contract.
    const qualityFindings = split(enrichFindings(aiPatterns.findings));

    // Categorize findings.
    const documentationGaps = docFindings;
    const deploymentFindings = [
      ...allReproFindings.filter((f) =>
        ['repro-no-ci', 'repro-no-docker', 'repro-no-env-example', 'repro-no-test-script', 'repro-no-run-script', 'repro-no-scripts'].includes(
          f.id
        )
      ),
      ...web3Findings.filter((f) => f.id.startsWith('web3-')),
    ];
    const reproFindings = [
      ...allReproFindings.filter((f) => !deploymentFindings.some((d) => d.id === f.id)),
      // The non-security hygiene rules (missing .gitignore, a workflow
      // that cannot run, no test runner) are reproducibility concerns.
      ...split(enrichFindings(hygiene.findings.filter((f) => f.category !== 'security'))),
    ];

    // Every split has run by now, so `fixtureFindings` is complete.
    // Grouped here rather than at render time because the web bundle
    // cannot call into core — see report/fixtures.ts.
    const fixtureSummary = groupFindings(fixtureFindings);

    const { blockers, total: blockerTotal } = collectBlockers(
      docFindings,
      allReproFindings,
      securityFindings,
      deploymentFindings,
      web3Findings,
      hackathonFindings
    );

    const scoring: ScoringInput = {
      hasReadme: doc.hasReadme,
      hasLicense: doc.hasLicense,
      hasContributing: doc.hasContributing,
      hasSecurityPolicy: doc.hasSecurityPolicy,
      hasEnvExample: doc.hasEnvExample,
      hasApiDocs: doc.hasApiDocs,
      hasScreenshots: doc.hasScreenshots,
      hasDemoUrl: doc.hasDemoUrl,
      hasLockfile: repro.hasLockfile,
      hasCI: repro.hasCI,
      hasDocker: repro.hasDocker,
      hasTestCommand: repro.hasTestCommand,
      hasRunCommand: repro.hasRunCommand,
      hasContracts: web3.hasContracts,
      hasDeployScripts: web3.hasDeployScripts,
      hasContractTests: web3.hasContractTests,
      hasAuditNote: web3.hasAuditNote,
      hasContractAddresses: web3.hasContractAddresses,
      hasHackathonDemoUrl: hackathon.hasDemoUrl,
      hasHackathonDemoVideo: hackathon.hasDemoVideo,
      hasHackathonArchitecture: hackathon.hasArchitecture,
      hasHackathonLicense: hackathon.hasLicense,
      hasHackathonNetwork: hackathon.hasNetwork,
      securityFindings,
      documentationFindings: documentationGaps,
      reproducibilityFindings: reproFindings,
      deploymentFindings,
      web3Findings,
      hackathonFindings,
    };

    const scores = scoreAll(scoring, { target: input.target });

    // The tier, resolved once. Both the report's `omittedSections` and its
    // prose about itself come from this one value, so they cannot disagree.
    const tier = { mode: input.auditMode, includeLaunchCopy: input.includeLaunchCopy };
    const omitted = omittedSections(tier);

    const { tasks: recommendedTasks, fromBlockers: tasksFromBlockers } =
      buildRecommendedTasks(blockers, web3, hackathon);
    const deploymentPlan = buildDeploymentPlan(input.auditMode, hasAny(input.contents, /dockerfile|docker-compose/i));
    // The same findings the score counted, after the split — not the array
    // that went into it. See `secretFindingIds` above.
    const launchSecretFindings = securityFindings.filter((f) => secretFindingIds.has(f.id));
    const launchChecklist = buildLaunchChecklist(
      doc,
      repro,
      web3,
      hackathon,
      launchSecretFindings,
      blockers
    );

    const baseReport: Report = {
      reportVersion: REPORT_VERSION,
      repository: {
        url: input.metadata.url,
        owner: input.metadata.owner,
        name: input.metadata.name,
        defaultBranch: input.metadata.defaultBranch,
        license: input.metadata.license,
        lastUpdatedAt: input.metadata.lastUpdatedAt,
        visibility: 'public',
        archived: input.metadata.archived,
        stars: input.metadata.stars,
        openIssues: input.metadata.openIssues,
        openPulls: input.metadata.openPulls,
        description: input.metadata.description,
        primaryLanguage: input.metadata.primaryLanguage,
      },
      summary: '',
      detectedStack: labels,
      // Recorded because two contract checks cannot be answered without it:
      // their rules only fire when a root `package.json` exists, so "no
      // finding" meant "pass" for a repository that has none (R-58). Read off
      // `allPaths`, the unfiltered tree, for the same reason the existence
      // checks above use it — `entries` has already dropped what `filterFiles`
      // considered unreadable, and a manifest is exactly the kind of small
      // JSON file that survives that filter but need not.
      //
      // Omitted, not `[]`, when the listing was truncated: `[]` claims the
      // tree holds none, and a capped listing cannot support that claim. The
      // contract then answers as it did before this field existed, which is
      // the honest option — see the field's docstring.
      manifests: input.truncated ? undefined : allPaths.filter(isManifestPath).sort(),
      scores,
      blockers,
      documentationGaps,
      securityFindings,
      qualityFindings,
      fixtureFindings,
      // Both categories are written down, not just consumed. They used to be
      // computed here and passed straight to `collectBlockers` (critical/high
      // only) and to the score, so the medium and low rules in them — which
      // include every one the quality contract asks about by id — were absent
      // from the report the contract reads. A repository with no CI answered
      // `ci.workflow => pass`. See the fields' docstrings in
      // `schemas/report.ts`.
      reproducibilityFindings: reproFindings,
      deploymentFindings,
      fixtureSummary,
      historyScan: input.historyScan,
      deploymentPlan,
      recommendedTasks,
      launchChecklist,
      omittedSections: omitted,
      launchCopy: { oneSentencePitch: '', shortDescription: '', xPost: '' },
      limitations: buildLimitations(
        input.truncated,
        tier,
        web3,
        input.historyScan,
        input.degraded ?? false,
        (input.contentSkipped ?? 0) + (input.unreadableBeforeFetch ?? 0),
        input.entries.length + (input.unreadableBeforeFetch ?? 0),
        // The two lists the report caps, with what the cap dropped. R-69:
        // a truncated list with no note reads as a complete one.
        {
          blockersShown: blockers.length,
          blockersTotal: blockerTotal,
          tasksShown: tasksFromBlockers,
          tasksTotal: blockers.length,
        }
      ),
      generatedAt: new Date().toISOString(),
      auditMode: input.auditMode,
      target: input.target,
      outputLanguage: input.outputLanguage,
      analyzerProvenance: buildProvenance({
        doc,
        repro,
        web3,
        hackathon,
        stack: stackSignals,
      }),
    };

    // Resolve the copy. Both come from the templates; there is no decorator
    // to apply first (R-38).
    const summary = templateSummary(baseReport);
    // Read the omission off the declaration rather than re-deriving it from
    // the two flags. One question, one answer.
    const launchCopy = omitted.includes('launchCopy')
      ? { oneSentencePitch: '', shortDescription: '', xPost: '' }
      : templateLaunchCopy(baseReport);

    return {
      report: { ...baseReport, summary, launchCopy },
      truncated: input.truncated,
    };
  }
}

/**
 * Which analyzer produced which part of the report.
 *
 * Every key here names an analyzer that ran. `'analyzers.llm'` used to be in
 * this map — `'optional; disabled by default'` — which was a claim about a
 * component rather than about an analyzer: no LLM analyzer has ever existed in
 * this repository, and the entry told every buyer of every report that one was
 * installed and switched off. It is gone, along with the rest of the unwired
 * LLM surface (R-38). Removing a key from a map that consumers read is a shape
 * change, so `REPORT_VERSION` moved to 1.3 with it.
 */
function buildProvenance(input: {
  doc: DocAnalysis;
  repro: ReproAnalysis;
  web3: Web3Analysis;
  hackathon: HackathonAnalysis;
  stack: StackSignal[];
}): Record<string, string> {
  return {
    'analyzers.documentation': 'static-file-presence + section-extraction',
    'analyzers.reproducibility': 'static-file-presence + package-scripts',
    'analyzers.secret': 'regex-patterns + entropy-heuristic',
    'analyzers.injection': 'keyword-matcher + invisible-unicode-detector',
    'analyzers.stack': 'filename + extension + manifest-keyword',
    'analyzers.web3': 'path-pattern + content-keyword',
    'analyzers.hackathon': 'readme-content + url-classifier',
    'analyzers.hygiene': 'file-tree + gitignore-parse + workflow-shape',
    'analyzers.ai-patterns': 'regex + brace-balanced body inspection',
    'analyzers.scoring': 'deterministic-rule-engine',
    'detectedStackKeys': input.stack.map((s) => `${s.key}:${s.confidence.toFixed(2)}`).join(','),
  };
}

/**
 * How many critical/high findings the report lists, and how many of those get
 * a recommended task.
 *
 * Named because the limitation text quotes them: a sentence that says "the top
 * 25" next to a `.slice(0, 20)` is the defect this batch is fixing, one layer
 * down.
 */
const MAX_BLOCKERS = 25;
const MAX_TASK_FINDINGS = 12;

/**
 * Which category wins a severity tie.
 *
 * The sort used to be severity-only, which left the order of equal-severity
 * findings to the input order — so *which* 25 of 40 survived a truncation was
 * arbitrary, and could differ between two runs over the same repository. R-69
 * left this open on purpose: it is a product decision, not a bug fix. This is
 * that decision, stated once: a credential leak outranks a deployment gap,
 * which outranks a reproducibility gap, and so on down to the hackathon
 * niceties. Ties below the category fall through to the finding id, so the list
 * is a function of the findings and nothing else.
 */
const CATEGORY_RANK: Record<string, number> = {
  security: 0,
  deployment: 1,
  reproducibility: 2,
  documentation: 3,
  web3: 4,
  hackathon: 5,
  meta: 6,
};

function compareBlockers(a: Finding, b: Finding): number {
  const bySeverity = severityWeight(b.severity) - severityWeight(a.severity);
  if (bySeverity !== 0) return bySeverity;
  const byCategory = (CATEGORY_RANK[a.category] ?? 99) - (CATEGORY_RANK[b.category] ?? 99);
  if (byCategory !== 0) return byCategory;
  // Not `localeCompare`: it reads the ICU locale, and the point of this
  // tiebreak is that the same findings produce the same order everywhere.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function collectBlockers(
  doc: Finding[],
  repro: Finding[],
  sec: Finding[],
  deploy: Finding[],
  web3: Finding[],
  hack: Finding[]
): { blockers: Finding[]; total: number } {
  // `deploy` already contains every `web3-*` finding — it is built as
  // `[...repro, ...web3Findings.filter(...)]` above — and `web3` is passed
  // again, so each web3 finding used to appear twice: once in `blockers` and
  // once more in `recommendedTasks`, which iterates `blockers`. On a web3
  // repository that filled 25 slots with 12 findings.
  //
  // Deduplicated by reference, not by id. The duplication is literal — the
  // same object sits in both arrays — so identity is exact, and an id-based
  // merge would be wrong the moment two genuinely different findings share an
  // id (two contract directories missing a deploy script are two findings).
  const seen = new Set<Finding>();
  const all = [...doc, ...repro, ...sec, ...deploy, ...web3, ...hack].filter((f) => {
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
  const ranked = all
    .filter((f) => f.severity === 'critical' || f.severity === 'high')
    .sort(compareBlockers);
  // `total` is what the report has to be able to say out loud. The list is
  // capped because a report with forty blockers is unreadable, but a cap
  // nobody mentions reads as "this is all of them" — which is what R-69 was.
  return { blockers: ranked.slice(0, MAX_BLOCKERS), total: ranked.length };
}

function severityWeight(s: 'critical' | 'high' | 'medium' | 'low'): number {
  return s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

/**
 * One task per blocker, up to `MAX_TASK_FINDINGS`.
 *
 * `fromBlockers` is how many findings actually got one, so the caller can say
 * so. The cap is deliberately not silent any more (R-69): a reader who closed
 * all twelve tasks believed the work was done.
 */
function buildRecommendedTasks(
  blockers: Finding[],
  web3: Web3Analysis,
  hackathon: HackathonAnalysis
): { tasks: Task[]; fromBlockers: number } {
  const out: Task[] = [];
  for (const f of blockers) {
    out.push({
      id: `task-${f.id}`,
      title: `Resolve: ${f.title}`,
      effort: f.severity === 'critical' ? 'L' : f.severity === 'high' ? 'M' : 'S',
      description: f.description,
      relatedFindings: [f.id],
      acceptanceCriteria: f.acceptanceCriteria.length
        ? f.acceptanceCriteria
        : [`Evidence for "${f.id}" no longer present in the repository tree.`],
    });
    if (out.length >= MAX_TASK_FINDINGS) break;
  }
  const fromBlockers = out.length;
  if (web3.hasContracts && !web3.hasContractTests) {
    out.push({
      id: 'task-add-contract-tests',
      title: 'Add Foundry or Hardhat contract tests',
      effort: 'L',
      description: 'Without contract tests, on-chain behavior is not verified.',
      relatedFindings: web3.findings.filter((f) => f.id === 'web3-no-contract-tests').map((f) => f.id),
      acceptanceCriteria: ['forge test (or npx hardhat test) exits 0.'],
    });
  }
  // Both tiers recommend this. It used to be `full`-only, which made the
  // recommended-task list a tier difference — it is not one: the tasks are
  // remediation for findings, and both tiers carry the findings.
  if (!hackathon.hasDemoUrl) {
    out.push({
      id: 'task-add-demo-url',
      title: 'Deploy a preview and link the demo URL in the README',
      effort: 'M',
      description: 'Add a reachable demo URL at the top of the README.',
      relatedFindings: ['hack-no-demo'],
      acceptanceCriteria: ['A live URL is reachable and returns 2xx.'],
    });
  }
  return { tasks: out, fromBlockers };
}

/**
 * The deployment plan — a `full`-tier section, so `quick` gets none.
 *
 * Returning `[]` rather than a shortened plan is the point: `omittedSections`
 * on the report says the plan was not included, and a reader that wants to
 * know whether this repository *has* a deployment story reads that field,
 * not the length of this array. A shortened plan would make the two
 * questions indistinguishable.
 */
function buildDeploymentPlan(mode: 'quick' | 'full', hasDocker: boolean): DeploymentStep[] {
  if (mode !== 'full') return [];
  const steps: DeploymentStep[] = [
    {
      order: 1,
      title: 'Prepare environment',
      description: 'Create a `.env` from `.env.example` and confirm Node/pnpm versions match CI.',
      commands: ['cp .env.example .env'],
      prerequisites: ['Node 20+', 'pnpm 9+'],
      acceptanceCriteria: ['pnpm install completes without errors on a fresh clone.'],
    },
    {
      order: 2,
      title: 'Run the test suite',
      description: 'Run tests and lint to confirm the code is in a green state.',
      commands: ['pnpm install', 'pnpm test', 'pnpm lint'],
      prerequisites: ['.env populated'],
      acceptanceCriteria: ['All tests pass; lint exits 0.'],
    },
  ];
  if (hasDocker) {
    steps.push({
      order: 3,
      title: 'Build and run with Docker',
      description: 'Use the provided Dockerfile to build a production image.',
      commands: ['docker build -t repopilot-audited .', 'docker run --rm -p 3000:3000 repopilot-audited'],
      prerequisites: ['Docker installed'],
      acceptanceCriteria: ['Container starts and the healthcheck endpoint returns 200.'],
    });
  } else {
    steps.push({
      order: 3,
      title: 'Provision a production host',
      description:
        'Choose a host (Railway, Render, Fly.io, a plain VPS). Add a Dockerfile if you need production parity.',
      commands: [],
      prerequisites: ['A managed Postgres or a SQLite-backed volume'],
      acceptanceCriteria: ['Service responds on a public URL.'],
    });
  }
  // Steps 4 and 5 are part of the plan the `full` tier sells. They used to
  // be gated on the mode *inside* a plan both tiers received, which is how
  // the tier difference ended up as two rows rather than a section.
  steps.push({
    order: 4,
    title: 'Configure reverse proxy + TLS',
    description: 'Terminate TLS in front of the service. Caddy / nginx / Cloudflare all work.',
    commands: [],
    prerequisites: ['A domain name'],
    acceptanceCriteria: ['HTTPS works; HSTS header is set.'],
  });
  steps.push({
    order: 5,
    title: 'Set up observability',
    description: 'Wire logs, error tracking, and uptime checks.',
    commands: [],
    prerequisites: ['An observability account (e.g. Better Stack, Sentry, Grafana Cloud)'],
    acceptanceCriteria: ['A test request appears in the log stream.'],
  });
  return steps;
}

function buildLaunchChecklist(
  doc: DocAnalysis,
  repro: ReproAnalysis,
  web3: Web3Analysis,
  hackathon: HackathonAnalysis,
  security: Finding[],
  blockers: Finding[]
): LaunchChecklistItem[] {
  const list: LaunchChecklistItem[] = [
    {
      id: 'check-readme',
      title: 'README explains install + run + test',
      done: doc.hasReadme,
      evidence: doc.hasReadme ? ['README.md present'] : ['README.md missing'],
    },
    {
      id: 'check-license',
      title: 'LICENSE present at the repository root',
      done: doc.hasLicense,
      evidence: doc.hasLicense ? ['LICENSE present'] : ['LICENSE missing'],
    },
    {
      id: 'check-env',
      title: '.env.example present and complete',
      done: doc.hasEnvExample,
      evidence: doc.hasEnvExample ? ['.env.example present'] : ['.env.example missing'],
    },
    {
      id: 'check-lockfile',
      title: 'Lockfile committed',
      done: repro.hasLockfile,
      evidence: repro.hasLockfile ? ['lockfile found'] : ['no lockfile found'],
    },
    {
      id: 'check-ci',
      title: 'CI runs install + test on every push',
      done: repro.hasCI,
      evidence: repro.hasCI ? ['.github/workflows/*.yml present'] : ['no CI config'],
    },
    {
      id: 'check-tests',
      title: 'Test script exits 0',
      done: repro.hasTestCommand,
      evidence: repro.hasTestCommand ? ['scripts.test defined'] : ['scripts.test missing'],
    },
    {
      id: 'check-secrets',
      title: 'No committed credentials',
      done: security.length === 0,
      // Condensed, not enumerated: a real self-audit put 639 titles on
      // this one line. The full list is still in `securityFindings`.
      evidence: condenseEvidence(security),
    },
  ];
  if (web3.hasContracts) {
    list.push({
      id: 'check-contracts-tested',
      title: 'Contracts covered by tests (Foundry / Hardhat)',
      done: web3.hasContractTests,
      evidence: web3.hasContractTests ? ['contract tests found'] : ['no contract tests'],
    });
  }
  if (hackathon.hasScreenshots !== undefined) {
    list.push({
      id: 'check-screenshots',
      title: 'At least one screenshot or diagram',
      done: hackathon.hasScreenshots,
      evidence: hackathon.hasScreenshots ? ['image files in repo'] : ['no image files in repo'],
    });
  }
  list.push({
    id: 'check-blockers',
    title: 'Zero critical/high blockers',
    done: blockers.length === 0,
    evidence: condenseEvidence(blockers),
  });
  return list;
}

function buildLimitations(
  truncated: boolean,
  tier: { mode: 'quick' | 'full'; includeLaunchCopy: boolean },
  web3: Web3Analysis,
  historyScan?: HistoryScan,
  degraded?: boolean,
  contentSkipped = 0,
  selectedFiles = 0,
  /**
   * What the two capped lists left out. Optional so the function stays usable
   * without them, but the builder always passes them — a caller that omits
   * this is asking for the silent truncation back.
   */
  listTruncation?: {
    blockersShown: number;
    blockersTotal: number;
    tasksShown: number;
    tasksTotal: number;
  }
): string[] {
  const out: string[] = [
    'Static analysis only — repository code is NEVER executed by RepoPilot.',
    'No formal security audit is performed; secret detection is best-effort.',
    // This read "LLM is optional; without one, the report uses deterministic
    // templates." There is no "without one" any more (R-38), and the sentence
    // implied a buyer could get a model-written report by configuring
    // something. Saying it as a property rather than as a fallback is both
    // shorter and the thing that is actually true.
    'No model writes any part of this report; every sentence is generated from deterministic templates.',
  ];

  // The scope of the history scan belongs in plain sight, not buried in
  // metadata. "No secrets in history" with no stated scope reads as "all
  // of history", which may be false.
  if (historyScan) {
    if (historyScan.scannedCommits === 0) {
      out.push(`Commit history was not scanned${historyScan.note ? `: ${historyScan.note}` : ''}.`);
    } else if (!historyScan.complete) {
      // Two different shortfalls wear the same `complete: false`. Reading
      // fewer commits than were asked for means the scan stopped part-way —
      // which is the case that used to report zero commits read and discard
      // the ones it had. Reading exactly as many as asked means there may be
      // older history nobody looked at. Only the second is "the most recent
      // N".
      out.push(
        historyScan.scannedCommits < historyScan.requestedCommits
          ? `Commit history was scanned for ${historyScan.scannedCommits} of ` +
            `${historyScan.requestedCommits} requested commits` +
            `${historyScan.note ? `: ${historyScan.note}` : ''}. Older history was not examined.`
          : `Commit history was scanned for the most recent ${historyScan.scannedCommits} ` +
            'commits only; older history was not examined.'
      );
    }
  }
  if (truncated) {
    out.push('The repository tree is large; the listing was truncated. Some files were not analyzed.');
  }
  // Distinct from the tree truncation above: there the *listing* was cut short,
  // here every wanted path was known and some of them still could not be read.
  // Both end with files nobody looked at, so both end in the same word — the
  // coverage contract in `quality/evaluate.ts` matches on it.
  if (contentSkipped > 0) {
    out.push(
      `Content was truncated out of this audit: ${contentSkipped} of ${selectedFiles} ` +
        'files the tree listed could not be read — over a size or byte cap, ' +
        'or absent from the archive. Findings from them are absent, not negative.'
    );
  }
  if (degraded) {
    out.push(
      'The repository archive could not be read, so files were fetched one at a time. ' +
        'The analysis is the same; the audit used far more of the GitHub request budget.'
    );
  }
  // The two capped lists, disclosed. Both sentences are generated from the
  // same constants that do the capping, so the count in the prose cannot drift
  // from the count in the list.
  if (listTruncation) {
    const { blockersShown, blockersTotal, tasksShown, tasksTotal } = listTruncation;
    if (blockersShown < blockersTotal) {
      out.push(
        `This report lists the top ${blockersShown} of ${blockersTotal} critical/high findings — ` +
          'ordered by severity, then by category (security, deployment, reproducibility, ' +
          'documentation, web3, hackathon). The remaining ' +
          `${blockersTotal - blockersShown} are counted in the score but are not listed here.`
      );
    }
    if (tasksShown < tasksTotal) {
      out.push(
        `Recommended tasks cover the first ${tasksShown} of the ${tasksTotal} findings listed ` +
          'as blockers; the rest need the same work and have no task row.'
      );
    }
  }
  // Generated from the tier declaration, never written here. The sentence
  // this replaces said a quick audit "skips some of the deeper
  // reproducibility heuristics" — nothing was skipped, and no test pinned
  // the claim. See report/tiers.ts and RISKS.md R-30.
  out.push(...tierLimitations(tier));
  if (web3.hasContracts) {
    out.push('Web3 analyzer checks engineering completeness only; it does NOT audit contract code.');
  }
  return out;
}

function hasAny(contents: Map<string, string>, re: RegExp): boolean {
  for (const k of contents.keys()) {
    if (re.test(k)) return true;
  }
  return false;
}
