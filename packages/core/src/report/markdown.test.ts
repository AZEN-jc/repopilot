/**
 * `reportToMarkdown` — the report as a document.
 *
 * The assertions are about three things: the numbers come from the report and
 * nowhere else, prose a rule author wrote cannot break the layout, and an
 * empty section is absent rather than presented as "none".
 */
import { describe, expect, it } from 'vitest';
import { reportToMarkdown } from './markdown.js';
import { makeFinding, makeReport } from '../test-utils/report-factory.js';

describe('reportToMarkdown', () => {
  it('renders the header, the summary and the score table from the report', () => {
    const report = makeReport({
      repository: {
        url: 'https://github.com/acme/widget',
        owner: 'acme',
        name: 'widget',
        defaultBranch: 'main',
        license: null,
        lastUpdatedAt: null,
        visibility: 'public',
        archived: false,
        stars: 0,
        openIssues: 0,
        openPulls: 0,
        description: null,
        primaryLanguage: null,
      },
      summary: 'A widget with a missing test script.',
      scores: {
        overall: 61,
        documentation: 54,
        reproducibility: 72,
        securityHygiene: 58,
        deploymentReadiness: 66,
        breakdown: {},
      },
      auditMode: 'full',
      target: 'production',
      reportVersion: '1.5',
    });

    const md = reportToMarkdown(report);
    expect(md).toContain('# acme/widget — release audit');
    expect(md).toContain('> A widget with a missing test script.');
    expect(md).toContain('| overall | 61 |');
    expect(md).toContain('| documentation | 54 |');
    expect(md).toContain('- mode: `full` · target: `production`');
    expect(md).toContain('- report contract: `v1.5`');
  });

  it('renders a blocker with its evidence coordinates and its fix', () => {
    const report = makeReport({
      blockers: [
        makeFinding({
          ruleId: 'REPO-TEST-001',
          severity: 'high',
          title: 'No test script',
          description: 'The manifest declares no test script.',
          evidence: [{ file: 'package.json', line: 8, reason: 'scripts.test is absent' }],
          recommendedAction: 'Add a test script that exits zero.',
        }),
      ],
    });

    const md = reportToMarkdown(report);
    expect(md).toContain('### Blockers (1)');
    expect(md).toContain('#### No test script');
    expect(md).toContain('- severity: `high`');
    expect(md).toContain('- rule: `REPO-TEST-001`');
    // The coordinate, in a code span, with the reason after it.
    expect(md).toContain('- `package.json:8` — scripts.test is absent');
    expect(md).toContain('Fix: Add a test script that exits zero.');
  });

  it('escapes prose a rule author wrote, so it cannot break the layout', () => {
    const report = makeReport({
      blockers: [
        makeFinding({
          title: '# Not a heading',
          description: 'A *starred* line and a [link](http://example.com).',
          recommendedAction: 'Run `pnpm test`_x*',
          evidence: [{ file: 'a b/c#d.txt', line: null, reason: 'no line for this one' }],
        }),
      ],
    });

    const md = reportToMarkdown(report);
    // Escaped at the point of use, not before: the headings the renderer wrote
    // are still headings, and the rule author's is not.
    expect(md).toContain('#### \\# Not a heading');
    expect(md).toContain('A \\*starred\\* line and a \\[link\\](http://example.com).');
    expect(md).toContain('Fix: Run \\`pnpm test\\`\\_x\\*');
    // A file with no line renders as a path alone, not `path:null`.
    expect(md).toContain('- `a b/c#d.txt` — no line for this one');
  });

  it('omits an empty section and says what was left out', () => {
    const report = makeReport({
      blockers: [],
      documentationGaps: [],
      omittedSections: ['deploymentPlan', 'launchCopy'],
      recommendedTasks: [],
      deploymentPlan: [],
      launchChecklist: [],
      limitations: [],
    });

    const md = reportToMarkdown(report);
    expect(md).not.toContain('### Blockers');
    expect(md).not.toContain('### Recommended tasks');
    expect(md).not.toContain('### Deployment plan');
    // The declaration, not a heading over nothing.
    expect(md).toContain('> This report does not include: deploymentPlan, launchCopy.');
  });

  it('drops the task list and the deployment plan when asked', () => {
    const report = makeReport({
      recommendedTasks: [
        { id: 'task-1', title: 'Add a test', effort: 'S', description: 'Add one.', relatedFindings: [], acceptanceCriteria: ['`pnpm test` exits 0'] },
      ],
      deploymentPlan: [
        { order: 1, title: 'Build', description: 'Build the image.', commands: ['pnpm build'], prerequisites: [], acceptanceCriteria: [] },
      ],
    });

    expect(reportToMarkdown(report)).toContain('### Recommended tasks');
    expect(reportToMarkdown(report)).toContain('### Deployment plan');
    const trimmed = reportToMarkdown(report, { includeTasks: false, includeDeploymentPlan: false });
    expect(trimmed).not.toContain('### Recommended tasks');
    expect(trimmed).not.toContain('### Deployment plan');
  });

  it('is deterministic, and ends with exactly one newline', () => {
    const report = makeReport();
    expect(reportToMarkdown(report)).toBe(reportToMarkdown(report));
    expect(reportToMarkdown(report).endsWith('\n')).toBe(true);
    expect(reportToMarkdown(report).endsWith('\n\n')).toBe(false);
  });
});
