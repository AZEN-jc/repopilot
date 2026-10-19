/**
 * Commit-history secret scanner.
 *
 * Finds credentials that were committed and later removed. The working
 * tree can be spotless while the secret stays reachable through history,
 * so a tree-only scan misses exactly the case that matters most.
 *
 * Remote-only by construction: this reads unified diffs through the
 * GitHub API. It never clones, never runs `git`, and never needs a local
 * working tree. See docs/ARCHITECTURE.md for the constraint.
 *
 * Like the working-tree scanner, the matched value is never read,
 * copied, returned or logged — only the kind, severity and a short
 * low-entropy reason.
 */
import type { Finding, Severity } from '../schemas/report.js';
import { isAllowlistedPath } from './shapes.js';
import { slugify } from './security-slug.js';
import {
  scanTextForSecrets,
  severityForPath,
  titleForKind,
  type SecretKind,
} from './secret-scanner.js';

export interface ScannedCommitFile {
  filename: string;
  /** Unified diff, or null when GitHub omitted it. */
  patch: string | null;
}

export interface ScannedCommit {
  sha: string;
  subject: string;
  date: string | null;
  files: ScannedCommitFile[];
}

export interface HistorySecretHit {
  kind: SecretKind;
  severity: Severity;
  reason: string;
  commitSha: string;
  commitSubject: string;
  commitDate: string | null;
  file: string;
  /** Line number in the version of the file this commit produced. */
  line: number | null;
}

/**
 * Extract the lines a patch ADDS, with their line numbers in the new file.
 *
 * Only added lines are scanned. A secret's first appearance is always an
 * addition, so this catches every introduction; scanning removed lines as
 * well would double-report the same credential on every later edit.
 */
export function addedLines(patch: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  let newLine = 0;

  // Whether the cursor is inside a hunk. Outside one, every line belongs to
  // the file preamble (`diff --git`, `index`, `---`, `+++`, mode lines) and
  // none of it is content.
  //
  // The preamble used to be filtered by prefix instead: any line starting
  // `+++` or `---` was dropped wherever it appeared. An added line whose own
  // text begins with `++` produces the patch line `+++…`, so it was read as a
  // file header — the line was never scanned, and because it also never
  // advanced `newLine`, every finding below it was reported one line early. A
  // hunk declares where it starts, so position is knowable from the diff; the
  // prefix alone is not.
  let inHunk = false;

  for (const raw of patch.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      inHunk = false;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    // "\ No newline at end of file" — carries no line of its own.
    if (raw.startsWith('\\')) continue;

    if (raw.startsWith('+')) {
      out.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
      continue;
    }
    if (raw.startsWith('-')) {
      // A deletion does not advance the new file's line counter.
      continue;
    }
    // Context line.
    newLine += 1;
  }

  return out;
}

/**
 * Scan commits for credentials.
 *
 * Deduplicated across commits by (kind, file, line text) rather than by line
 * number: the same credential usually shows up in several commits as it
 * gets edited, and reporting it once per commit would bury the signal. The
 * earliest commit that introduced it wins, because that is the one a
 * responder needs.
 *
 * It used to key on (kind, file, reason), and `reason` is a constant per
 * pattern — so a file holding two AWS keys produced one finding. The key is
 * the line's text now: two different secrets differ there, and the same
 * secret edited around keeps the same text.
 */
export function scanCommitsForSecrets(commits: ScannedCommit[]): HistorySecretHit[] {
  const hits: HistorySecretHit[] = [];
  const seen = new Set<string>();

  // Oldest first, so the introducing commit is the one we keep.
  //
  // Reversed before sorting because the caller hands commits over newest first
  // (GitHub's order) and `sort` is stable: with the input reversed, two commits
  // that share a timestamp keep the older one first. Without it a tie kept
  // whichever the API listed first — the newer one — and the finding named a
  // commit that merely *contains* the credential rather than the one that
  // introduced it, which is the commit a responder has to rewrite.
  //
  // A commit whose date could not be read sorts last rather than first: it is
  // unknown, not ancient, and preferring a dated commit when both carry the
  // credential is the only ordering that is not a guess.
  const ordered = [...commits]
    .reverse()
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

  for (const commit of ordered) {
    for (const file of commit.files) {
      if (!file.patch) continue;
      const allowlist = isAllowlistedPath(file.filename);

      // The patch is passed as `fileContent` as well as scanned line by line.
      // A file-level question asked of a single line answers wrongly: the
      // BIP-39 wordlist's lines are twelve words each, which is below the
      // floor `isWordlistFile` needs before it will judge a file at all, so
      // the mnemonic rule reported the commit that introduced the wordlist.
      // The whole patch is the widest sample available here, and for the
      // commit that adds a file it *is* the file.
      const patch = file.patch;
      for (const added of addedLines(patch)) {
        for (const hit of scanTextForSecrets(added.text, {
          allowlist,
          path: file.filename,
          fileContent: patch,
        })) {
          // Keyed on (kind, file, the line's text) — not on the reason, which
          // is a fixed string per pattern. Two different AWS keys in one file
          // both carried `reason: 'AWS access key ID pattern'`, so the second
          // one was silently dropped: a responder would rotate the key they
          // were told about and leave the other one live. The line text is the
          // discriminator because it is what actually differs between two
          // secrets, and it is stable across commits when the same credential
          // is edited around rather than replaced — which is the case this
          // dedupe exists for.
          const key = `${hit.kind}::${file.filename}::${added.text.trim()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({
            kind: hit.kind,
            // Fixture paths downgrade here too: a fake key in a test file
            // that was later deleted is not a release blocker.
            severity: severityForPath(file.filename, hit.severity),
            reason: hit.reason,
            commitSha: commit.sha,
            commitSubject: commit.subject,
            commitDate: commit.date,
            file: file.filename,
            line: added.line,
          });
        }
      }
    }
  }

  return hits;
}

/**
 * Aggregate history hits into the canonical Finding shape.
 *
 * The id embeds the short commit sha: the same credential committed in
 * two different commits is two findings, because it is two separate
 * introductions to clean up. Re-auditing the same history yields the
 * same ids.
 *
 * The remediation wording differs from the working-tree rule on purpose.
 * A secret in the tree is fixed by moving it to the environment; a secret
 * in history is fixed by rotating it and then rewriting history, which is
 * destructive and needs coordination.
 */
export function toHistoryFindings(hits: HistorySecretHit[]): Finding[] {
  const byKey = new Map<string, Finding>();

  for (const h of hits) {
    const shortSha = h.commitSha.slice(0, 7);
    const id = `secret-history-${h.kind}-${shortSha}-${slugify(h.file)}`;
    if (byKey.has(id)) continue;

    byKey.set(id, {
      id,
      category: 'security',
      severity: h.severity,
      title: `Secret in commit history: ${titleForKind(h.kind)}`,
      description:
        `${titleForKind(h.kind)} was committed in ${shortSha} and remains reachable through the ` +
        'repository history. Removing it from the working tree does not remove it from history.',
      evidence: [
        {
          file: h.file,
          line: h.line,
          reason:
            `${h.reason} — introduced in ${shortSha} ("${h.commitSubject}", ` +
            `${h.commitDate ?? 'date unknown'})`,
          source: 'git_history',
        },
      ],
      recommendedAction:
        'Rotate the credential at the issuing service first — history rewriting does not undo ' +
        'an exposure. Then purge it from history (git filter-repo or BFG) and force-push, after ' +
        'agreeing the rewrite with everyone who has a clone.',
      acceptanceCriteria: [
        'The credential is revoked or rotated at the issuing service.',
        'The secret is no longer reachable from any commit on any branch.',
        'Any published artefact that contained it (release, package, image) has been replaced.',
      ],
    });
  }

  return [...byKey.values()];
}
