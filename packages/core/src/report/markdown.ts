/**
 * Render a report as Markdown.
 *
 * The report is a JSON document for machines. This is the same report as a
 * document a human can paste into a pull request, a ticket, or a release
 * note — which is the question the report actually answers, asked in a
 * different place.
 *
 * Three rules, in order of how easy they are to get wrong:
 *
 * 1. **Every number comes from the report.** Nothing is computed, inferred or
 *    rounded here. A renderer that recomputes a total is a second
 *    implementation of the scoring, and the two will drift.
 * 2. **Prose is escaped, code is not.** Finding titles and descriptions are
 *    whatever the rule author wrote, and a `#` at the start of one turns into a
 *    heading if it is pasted in raw. Paths are the exception: they go in code
 *    spans, where backslashes and asterisks are literal.
 * 3. **An empty section is omitted, not printed as "none".** A `quick` report
 *    has no deployment plan by declaration, and a heading over nothing reads
 *    as a claim that nothing was found. `omittedSections` is printed instead.
 */
import type { Finding, Report } from '../schemas/index.js';

export interface MarkdownOptions {
  /** Include the recommended-task list. Default `true`. */
  includeTasks?: boolean;
  /** Include the deployment plan. Default `true`. */
  includeDeploymentPlan?: boolean;
}

/** Escape the characters Markdown would otherwise interpret. */
function escapeInline(text: string): string {
  return text
    .replace(/([\\`*_[\]<>])/g, '\\$1')
    // A leading `#`, `-`, `+` or `>` only matters at the start of a line, and
    // escaping it everywhere would put backslashes in the middle of prose.
    .replace(/^([#>+-])/, '\\$1')
    .replace(/^(\d{1,9})\. /, '$1\\. ');
}

/** `path:line` — reason, with the path in a code span. */
function evidenceLine(evidence: Finding['evidence'][number]): string {
  const where = evidence.line === null ? evidence.file : `${evidence.file}:${evidence.line}`;
  return `- \`${where}\` — ${escapeInline(evidence.reason)}`;
}

function findingBlock(finding: Finding): string[] {
  const lines: string[] = [
    `#### ${escapeInline(finding.title)}`,
    '',
    `- severity: \`${finding.severity}\``,
  ];
  if (finding.ruleId) lines.push(`- rule: \`${escapeInline(finding.ruleId)}\``);
  lines.push('', escapeInline(finding.description), '');
  if (finding.evidence.length > 0) {
    lines.push('Evidence:');
    lines.push(...finding.evidence.map(evidenceLine));
    lines.push('');
  }
  lines.push(`Fix: ${escapeInline(finding.recommendedAction)}`, '');
  return lines;
}

/** A finding group, or nothing at all when there is nothing to say. */
function group(title: string, findings: Finding[]): string[] {
  if (findings.length === 0) return [];
  return [`### ${title} (${findings.length})`, '', ...findings.flatMap(findingBlock)];
}

export function reportToMarkdown(report: Report, opts: MarkdownOptions = {}): string {
  const includeTasks = opts.includeTasks ?? true;
  const includeDeploymentPlan = opts.includeDeploymentPlan ?? true;
  const out: string[] = [];

  out.push(
    `# ${escapeInline(report.repository.owner)}/${escapeInline(report.repository.name)} — release audit`,
    '',
    `> ${escapeInline(report.summary)}`,
    '',
    `- report contract: \`v${report.reportVersion}\``,
    `- mode: \`${report.auditMode}\` · target: \`${report.target}\``,
    `- generated: ${report.generatedAt}`,
    '',
  );

  if (report.detectedStack.length > 0) {
    out.push(
      '### Detected stack',
      '',
      report.detectedStack.map((s) => `- ${escapeInline(s)}`).join('\n'),
      '',
    );
  }

  out.push(
    '### Scores',
    '',
    '| dimension | score |',
    '| --- | --- |',
    `| overall | ${report.scores.overall} |`,
    `| documentation | ${report.scores.documentation} |`,
    `| reproducibility | ${report.scores.reproducibility} |`,
    `| security hygiene | ${report.scores.securityHygiene} |`,
    `| deployment readiness | ${report.scores.deploymentReadiness} |`,
    '',
  );

  out.push(...group('Blockers', report.blockers));
  out.push(...group('Documentation gaps', report.documentationGaps));
  out.push(...group('Security findings', report.securityFindings));
  out.push(...group('Reproducibility findings', report.reproducibilityFindings));
  out.push(...group('Deployment findings', report.deploymentFindings));
  out.push(...group('Code hygiene', report.qualityFindings));
  out.push(...group('Fixture findings', report.fixtureFindings));

  if (report.historyScan) {
    out.push(
      '### History scan',
      '',
      `- commits scanned: ${report.historyScan.scannedCommits}`,
      `- complete: ${report.historyScan.complete ? 'yes' : 'no'}`,
      '',
    );
  }

  if (includeTasks && report.recommendedTasks.length > 0) {
    out.push('### Recommended tasks', '');
    for (const task of report.recommendedTasks) {
      out.push(
        `#### ${escapeInline(task.title)} (\`${task.effort}\`)`,
        '',
        escapeInline(task.description),
        '',
      );
      if (task.acceptanceCriteria.length > 0) {
        out.push('Acceptance criteria:', ...task.acceptanceCriteria.map((c) => `- ${escapeInline(c)}`), '');
      }
    }
  }

  if (includeDeploymentPlan && report.deploymentPlan.length > 0) {
    out.push('### Deployment plan', '');
    for (const step of report.deploymentPlan) {
      out.push(`#### ${step.order}. ${escapeInline(step.title)}`, '', escapeInline(step.description), '');
      if (step.prerequisites.length > 0) {
        out.push('Prerequisites:', ...step.prerequisites.map((p) => `- ${escapeInline(p)}`), '');
      }
      if (step.commands.length > 0) {
        out.push('Commands:', '', '```bash', ...step.commands, '```', '');
      }
      if (step.acceptanceCriteria.length > 0) {
        out.push(
          'Acceptance criteria:',
          ...step.acceptanceCriteria.map((c) => `- ${escapeInline(c)}`),
          '',
        );
      }
    }
  }

  if (report.launchChecklist.length > 0) {
    out.push(
      '### Launch checklist',
      '',
      ...report.launchChecklist.map(
        (item) => `- [${item.done ? 'x' : ' '}] ${escapeInline(item.title)}`,
      ),
      '',
    );
  }

  if (report.limitations.length > 0) {
    out.push('### Limitations', '', ...report.limitations.map((l) => `- ${escapeInline(l)}`), '');
  }

  // Printed last, and as a sentence rather than a heading: a `quick` report
  // has no deployment plan by declaration, and a reader who does not know that
  // reads the missing section as an empty one.
  if (report.omittedSections.length > 0) {
    out.push(
      '',
      `> This report does not include: ${report.omittedSections.map(escapeInline).join(', ')}.`,
    );
  }

  return `${out.join('\n').trimEnd()}\n`;
}
