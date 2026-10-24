# RISKS.md

Active risks the team is aware of and how they are mitigated.

## Contents

- [R-01](#r-01--sandbox-escape-via-target-repo-content) — Sandbox escape via target repo content
- [R-02](#r-02--mock-payment-silently-used-in-production) — Mock payment silently used in production
- [R-03](#r-03--github-rate-limiting-anonymous-60-reqh) — GitHub rate limiting (anonymous 60 req/h)
- [R-04](#r-04--dependency-drift-zod--mcp-sdk--pino) — Dependency drift (zod / MCP SDK / pino)
- [R-05](#r-05--zod-325--registry-mirror-gap) — zod 3.25 / registry mirror gap
- [R-06](#r-06--sqlite-in-production-by-accident) — SQLite in production by accident
- [R-07](#r-07--cors-misconfiguration-in-production) — CORS misconfiguration in production
- [R-08](#r-08--prompt-injection-in-readme--source) — Prompt injection in README / source
- [R-09](#r-09--database-file-locked--migration-crash) — Database file locked / migration crash
- [R-10](#r-10--log-redaction-bypass) — Log redaction bypass
- [R-11](#r-11--marketplace-hero--branding-not-provided) — Marketplace hero / branding not provided
- [R-12](#r-12--pii-leakage-from-the-audited-repo) — PII leakage from the audited repo
- [R-13](#r-13--a-gate-on-a-large-repository-times-out) — A gate on a large repository times out
- [R-14](#r-14--a-docker-build-that-needs-github-releases-to-be-reachable)
  — A Docker build that needs GitHub Releases to be reachable
- [R-15](#r-15--user-shares-real-okx-keys-in-chat) — User shares real OKX keys in chat
- [R-16](#r-16--inline-audit-queue-used-in-production-in-process-no-durability)
  — Inline audit queue used in production (in-process, no durability)
- [R-17](#r-17--tarball-extraction-exhausts-disk--memory) — Tarball extraction exhausts disk / memory
- [R-18](#r-18--ast-parsing-oom-on-a-pathological-file) — AST parsing OOM on a pathological file
- [R-19](#r-19--compare-api-returns-a-truncated-diff) — Compare API returns a truncated diff
- [R-20](#r-20--intelligence-artifacts-inflate-report_json) — Intelligence artifacts inflate `report_json`
- [R-21](#r-21--new-dependency-breaks-the-zod--mcp-sdk-pins) — New dependency breaks the zod / MCP SDK pins
- [R-22](#r-22--a-lockfile-drives-securityhygiene-to-0) — A lockfile drives `securityHygiene` to 0
- [R-23](#r-23--two-hits-of-one-rule-on-one-line-share-a-fingerprint)
  — Two hits of one rule on one line share a fingerprint
- [R-24](#r-24--a-reverse-proxy-that-omits-x-forwarded-for-disables-rate-limiting)
  — A reverse proxy that omits `X-Forwarded-For` disables rate limiting
- [R-25](#r-25--a-healthy-container-can-be-serving-an-unmigrated-database)
  — A healthy container can be serving an unmigrated database
- [R-26](#r-26--a-check-that-never-runs-is-indistinguishable-from-one-that-passes)
  — A check that never runs is indistinguishable from one that passes
- [R-27](#r-27--a-check-that-can-never-pass-is-indistinguishable-from-one-that-found-nothing)
  — A check that can never pass is indistinguishable from one that found nothing
- [R-28](#r-28--a-green-tick-over-a-capability-the-repository-does-not-have)
  — A green tick over a capability the repository does not have
- [R-29](#r-29--the-mnemonic-rule-fires-on-the-dictionary-of-mnemonics)
  — The mnemonic rule fires on the dictionary of mnemonics
- [R-30](#r-30--quick-and-full-are-the-same-analysis-at-two-prices)
  — `quick` and `full` are the same analysis at two prices
- [R-31](#r-31--the-typecheck-gate-does-not-cover-scripts)
  — The typecheck gate does not cover `scripts/`
- [R-32](#r-32--the-injection-rule-reports-the-sentence-that-documents-the-injection-rule)
  — The injection rule reports the sentence that documents the injection rule
- [R-33](#r-33--the-local-lint-gate-checks-downstream-packages-against-a-stale-dist)
  — The local lint gate checks downstream packages against a stale `dist`
- [R-34](#r-34--the-mcp-server-cannot-be-installed-outside-its-own-checkout)
  — The MCP server cannot be installed outside its own checkout
- [R-35](#r-35--a-test-that-re-implements-the-code-under-test-asserts-nothing-about-it)
  — A test that re-implements the code under test asserts nothing about it
- [R-36](#r-36--a-document-cannot-disagree-with-a-function-it-is-never-compared-to)
  — A document cannot disagree with a function it is never compared to
- [R-37](#r-37--the-paid-service-is-sold-as-modefull-and-the-server-defaulted-to-quick)
  — The paid service is sold as `mode=full` and the server defaulted to `quick`
- [R-38](#r-38--the-llm-provider-was-wired-from-config-and-never-read)
  — The LLM provider was wired from config and never read
- [R-39](#r-39--the-okx-paid-endpoint-answered-400-to-every-buyer-before-verifying-anything)
  — The OKX paid endpoint answered 400 to every buyer before verifying anything
- [R-40](#r-40--one-signed-authorization-bought-unlimited-audits)
  — One signed authorization bought unlimited audits
- [R-42](#r-42--the-burned-nonce-record-lived-in-the-process-so-a-restart-re-opened-the-rail)
  — The burned-nonce record lived in the process, so a restart re-opened the rail
  (`R-41` is unused)
- [R-43](#r-43--a-retryable-failure-could-reach-no-terminal-state-on-either-driver)
  — The inline queue never retries and never terminates a retryable failure
- [R-44](#r-44--a-worker-that-died-mid-attempt-left-the-job-a-client-polls-forever)
  — The crash half of R-43: a dead worker's row is skipped by every redelivery
- [R-45](#r-45--the-report-cache-key-collapsed-onto-one-bucket-per-repository)
  — A `main`/`master` guess put every non-standard repository on one cache entry
- [R-46](#r-46--a-completed-audit-was-re-served-to-anyone-who-knew-its-idempotency-key)
  — The completed-row short-circuit ran before payment verification
- [R-47](#r-47--a-forged-x-payment-returned-a-paid-report-for-nothing)
  — The branch checked that the header *named* the payment, not that it proved it
- [R-48](#r-48--the-quality-contract-answered-pass-about-findings-the-report-never-carried)
  — Two computed categories were never written into the report the contract reads
- [R-49](#r-49--every-cached-audit-on-postgres-failed-retryably-forever)
  — `JSON.parse` on a JSONB column that the driver had already parsed
- [R-50](#r-50--does-this-file-exist-was-asked-of-the-files-the-audit-chose-to-read)
  — Existence checks ran on the filtered list, so a large lockfile was "missing"
- [R-51](#r-51--the-price-gate-read-six-of-the-seven-places-a-price-is-stated)
  — The MCP binary's own fallback price was not in the list
- [R-52](#r-52--the-compose-secret-rule-compared-the-value-not-the-key)
  — The rule could only fire if a value contained the text `PASSWORD=`
- [R-53](#r-53--the-mcp-binary-guessed-at-its-own-configuration)
  — A misspelled `PAYMENT_MODE` became a free-audit server, silently
- [R-54](#r-54--a-web3-finding-appeared-twice-in-blockers-and-twice-in-the-task-list)
  — `collectBlockers` was handed the same findings through two arrays
- [R-55](#r-55--two-different-credentials-in-one-file-produced-one-history-finding)
  — The dedupe key used a constant `reason`, not the line's text
- [R-56](#r-56--an-idempotency-key-was-a-global-namespace-with-no-binding)
  — Same key, different body, and the other repository's job came back
- [R-57](#r-57--payment-challenges-and-receipts-live-in-process-memory)
  — Accepted: correct for one replica, broken for two
- [R-58](#r-58--two-contract-checks-read-the-rule-did-not-run-as-the-rule-passed)
  — The report now says which manifests exist, so "could not look" is a warning
- [R-59](#r-59--an-added-line-starting-with-a-double-plus-was-read-as-a-file-header)
  — The header filter was a prefix test, so `++x` was dropped and the count slipped
- [R-60](#r-60--a-timestamp-tie-named-the-newer-commit-as-the-introduction)
  — A stable sort kept GitHub's newest-first order for equal dates
- [R-61](#r-61--a-truncated-tree-was-reported-as-an-unreadable-archive)
  — Two facts shared one flag, so the map explained the wrong one
- [R-62](#r-62--an-okx-buyer-saw-a-blank-page-when-capabilities-failed)
  — The payment card was gated on a fetch whose failure is swallowed
- [R-63](#r-63--two-documented-knobs-that-no-module-read)
  — `FETCH_TIMEOUT_MS` and `ANALYSIS_TIMEOUT_MS` were advertised and ignored
- [R-64](#r-64--an-assertion-that-could-not-fail)
  — `expect(server).toBeTruthy()` under a name that promised a tool-list check
- [R-65](#r-65--the-raw-failure-message-is-stored-and-served-to-anyone-with-the-job-id)
  — Fixed: a fixed sentence per code, the message to the log
- [R-66](#r-66--two-concurrent-first-uses-of-one-idempotency-key-answer-500)
  — Fixed: one insert carrying the key, and the collision returns the winner
- [R-67](#r-67--an-unknown-payment-network-is-half-applied)
  — Fixed: a closed union, and the xlayer fallback is gone
- [R-68](#r-68--the-launch-checklist-reads-the-secret-list-from-before-the-split)
  — Fixed: the checklist reads the post-split secret subset
- [R-69](#r-69--blockers-and-recommended-tasks-are-truncated-in-silence)
  — Fixed: the caps are disclosed, and the order is a stated rule
- [R-70](#r-70--shutdown-abandons-the-jobs-the-queue-already-accepted)
  — Fixed: refusing new work no longer stops the drain
- [R-71](#r-71--the-completed-write-is-the-one-status-transition-that-is-not-guarded)
  — Fixed: all four transitions are guarded
- [R-72](#r-72--health-reads-every-audit-report-on-sqlite-to-count-one-row)
  — Fixed: `ORDER BY … DESC LIMIT n` on both backends
- [R-73](#r-73--the-mcp-gate-passes-on-the-word-tools)
  — Fixed: the reply is parsed and compared to the registrations
- [R-74](#r-74--the-free-check-guesses-main-and-a-test-pins-the-guess)
  — Fixed: the fallback ref is `HEAD`
- [R-75](#r-75--an-enqueue-failure-writes-a-terminal-state-and-the-drivers-own-error-text)
  — Fixed: the row stays `queued`, the message goes to the log
- [R-76](#r-76--health-calls-a-queue-that-never-started-ok-and-gives-two-states-one-number)
  — Fixed: not-started is `unavailable`, and `active` splits `pending`
- [R-77](#r-77--a-queued-job-has-no-deadline-and-only-a-re-enqueue-can-move-it)
  — Accepted residual: the sweep needs a threshold the row cannot justify
- [R-78](#r-78--the-mcp-servers-http-transport-is-unauthenticated-by-design)
- [R-79](#r-79--the-published-contract-was-a-second-copy-and-nothing-read-it)
- [R-80](#r-80--a-collector-that-is-down-looks-exactly-like-tracing-that-is-off)
  — Mitigated by default: loopback, and mock payment is refused off it

---

## How to read this file

<!-- docs-facts:risk-count -->79<!-- docs-facts:end --> entries (`R-41` is unused;
the numbering jumps). The count is generated — `scripts/docs-facts.ts` renders it
from the `## R-` headings — because it was written as an English numeral and
hand-bumped on every addition, which is the one number a reader cannot check at a
glance. Everything else in this file is prose on purpose: the version labels
record when a risk was mitigated, so nothing else here is derivable, and the
*shape* is what is checked instead of the contents, by `checkRisksRegister()`.
Every entry carries a `**Status:**` line as of 2026-10-08, and the line starts
the line — a status folded into a `**Severity:**` line is invisible to a search
and reads as no status at all, which is how three of them were lost until then.
Five values, and they mean different things:

- **Fixed `<date>`** — the mitigation is in the tree, and the entry says what
  would have to break for it to come back.
- **Accepted residual** — a decision, not a deferral. The entry says why the
  cost is worth paying and what would change the decision.
- **Open** — work not done, with the reason it is not in this batch and the
  trigger that would move it up.
- **Mitigated in `<version>`** — the older spelling of *Fixed*, used by the
  entries written during the `0.1.0-rc.*` work.
- **Mitigated by design** — the control and the entry were written in the same
  change, so there is no fix date: the risk was never unmitigated in the tree.
  The entry names the control, and the residual is whatever the control cannot
  reach. This is the value twenty-one of these entries needed and the
  vocabulary did not have — which is why they went unlabelled rather than
  mislabelled, and why "the convention is younger than most of the file" was
  never the whole explanation.

`pnpm docs:check` enforces the shape now: every `## R-NN` heading is in
Contents, Contents lists nothing that is not a heading, every anchor resolves
against the heading it names, every entry has exactly one `**Status:**` line
whose value is one of the five above, and the number of `## R-` lines equals
the number of headings the check parsed. That last one is there because the
first four walk *parsed* entries and *listed* rows, so a heading whose
separator drifts — `## R-29: …` instead of `## R-29 — …` — stops being an
entry, and if its Contents row is gone too, nothing else in the check can see
it. Measured: the run prints `41 risks` and says nothing. `checkRisksRegister()`
in `scripts/docs-facts.ts` is that check.

The sweep was worth doing for a reason other than tidiness. Three of the
twenty-four entries that had no *greppable* status turned out to be **wrong**:
R-11 reported a release blocker that had been resolved by the same change that
wrote the entry, R-19 described a mitigation in a class that does not exist in
the tree, and R-21 claimed a pin the file it named does not carry. A register
whose states cannot be read is a register whose states are not checked. A fourth
was wrong in the field *next* to the one being written: R-01's `**Mitigation:**`
attributed its path checks to a class that does none and described a temporary
directory that no longer exists. Both were removed by R-17 and this entry was
never told. Reading an entry end to end to write one line is what surfaces that,
and nothing else in the file's shape does.

That was the failure this section was written against, and it is worth keeping
the record: "which of these are still open?" used to be answerable only by
reading every entry end to end. Twenty-one of them said nothing greppable about
their state, so a reader who searched for "open" got a partial answer that
looked like a complete one — and a reader who searched for `**Status:**` got
eighteen of twenty-one, which is the same defect with a smaller gap.

One more reading rule, learned the hard way in this batch: **a reference to an
entry that does not exist is a defect, not a shorthand.** Twelve references to
`R-42` lived across four documents while no such entry existed, so every reader
following one of them arrived at nothing. If you cite a risk, write it down in
the same change. (This said fourteen until it was counted; see R-42.)

**What this file still cannot check.** The shape is enforced — index, anchors,
status lines — but `**Mitigation:**` is prose, and a script cannot tell a
control that exists from one that was deleted last month. R-01 is the evidence.
Re-reading all forty-two by hand is a sweep with no automation to share;
`BACKLOG.md` records that rather than pretending the check covers it.

---

## R-01 — Sandbox escape via target repo content

**Severity:** Critical
**Likelihood:** Possible (the system reads untrusted code by design)
**Status:** Mitigated by design — the pipeline reads target-repo text and never
executes it, and there is no filesystem left to escape to. `classifyFile`
rejects `..`, `.git/` and `node_modules/` (`packages/core/src/git/files.ts:115`;
`filterFiles` is the caller that acts on the verdict),
and R-17 removed the only place extraction touched a directory.
**Mitigation:** The pipeline never executes target-repo code. Only text
is read. Binary files are skipped. Path traversal, `.git/`, `node_modules/`
and unexpected dotfiles are rejected before a file is read: `classifyFile`
returns `ignore` for each of them and `filterFiles` is what acts on the
verdict (`packages/core/src/pipeline.ts:88`). Extraction never touches a
directory at all — the tarball is gunzipped and walked in memory, bounded by
`MAX_ARCHIVE_BYTES` (64 MiB) and `MAX_EXTRACTED_BYTES` (256 MiB) — so there is
no temporary directory to escape into or to leak. The sentence that used to
stand here attributed the path rejection to `GitFetcher` and described a
`runMigrations` helper inside the fetcher sandboxed to `/tmp/repopilot-*`;
`GitFetcher` does no path checking, `runMigrations` is a database migration in
`apps/api/src/db/client.ts`, and `packages/core/src` contains no temp-directory
code at all.

**Detection:** `security/injection.ts` flags prompt-injection style
content as a finding; the finding is reported, not acted on.

## R-02 — Mock payment silently used in production

**Severity:** High
**Likelihood:** Low (with proper guards)
**Status:** Mitigated in 0.1.0-rc.2 (still a release-blocker until
`GET /health` reports `paymentMode=okx` against the production env).

**Mitigation (0.1.0-rc.2):**
- Hard guard in `apps/api/src/config.ts`: `validateProductionConfig()` collects
  the unsafe combinations and throws `ProductionConfigError` before anything
  binds (`config.ts:125-151`, called from `loadConfig()` at `:167`) when
  `NODE_ENV=production` and `PAYMENT_MODE=mock`. Not a warning, no silent
  fallback. Deliberately not in the schema, and the file says why: "`env:check`
  and the config schema alone are not enough: they let a misconfigured server
  boot, log a warning, and accept payment in mock mode" (`config.ts:74-78`).
- `buildPaymentAdapter()` continues to refuse construction with an
  empty or malformed `recipientAddress` — it validates the address
  itself, not via `isConfigured()` (which no production path calls;
  corrected in R-39). The factory does not silently fall back to mock.
- The same rule is also encoded in `pnpm env:check` for CI.
- Error messages never include the OKX secret, the GitHub token, or
  any other credential.

**Detection:** `/health` returns the active `paymentMode`. Operators
must verify `paymentMode=okx` immediately after production deploy.

## R-03 — GitHub rate limiting (anonymous 60 req/h)

**Severity:** Medium
**Likelihood:** High for unauthenticated production usage
**Status:** Accepted residual — the budget is GitHub's, not ours, so nothing
we build removes the risk. `GITHUB_TOKEN` raises it to 5000 req/h.
**Mitigation:** Documented as a known limit. `GITHUB_TOKEN` env var
unlocks 5000 req/h. The gate that suffers most is `pnpm verify:release`, which
audits `octocat/Hello-World` for real — one anonymous run can spend the whole
hourly budget (see `PROJECT_STATE.md`).

**Detection:** A 403 becomes a fixed message that names the fix —
`Rate-limited or forbidden while listing <owner>/<repo>. Set GITHUB_TOKEN to
raise the limit.` (`packages/core/src/git/fetcher.ts:122-125`; the archive path
says the same at `:354-357`). It does **not** report how much quota is left:
GitHub's `x-ratelimit-remaining` header is not read anywhere in the fetcher,
which is what this entry used to claim and why it is worth naming.

## R-04 — Dependency drift (zod / MCP SDK / pino)

**Severity:** Medium
**Likelihood:** Medium (registry / SDK changes)
**Status:** Mitigated by design — D-003/D-004 write the pins down and CI
installs with `--frozen-lockfile`. That catches an edited lockfile, not a
registry that moved under a caret range; `overrides` closes that half, and it
covers zod and the MCP SDK (R-21) but not pino — D-004 chose `^10.0.0` there,
and the failure it guards against is a named-import break that `pnpm typecheck`
catches, so the caret is a decision rather than a gap.
**Mitigation:** All critical pins are documented in `DECISIONS.md`
(D-003, D-004). `pnpm install` uses `--frozen-lockfile` in CI. PRs that
bump these versions must include a test for the version-specific
behavior.

**Detection:** CI runs `pnpm install --frozen-lockfile`; a successful
run is the gate.

## R-05 — zod 3.25 / registry mirror gap

**Severity:** Low
**Likelihood:** Was blocking rc.1
**Status:** Mitigated by design — the pin is the resolution, and it is in
`pnpm-workspace.yaml` `overrides`, which is where the next reader will look for
it (R-21).
**Mitigation:** Resolved by pinning to zod 3.24.1 + MCP SDK 1.22.0.
If the mirror starts serving 3.25.x, we can lift the pin in a
separate PR after exercising the new tool surface.

## R-06 — SQLite in production by accident

**Severity:** Medium
**Likelihood:** Low
**Status:** Mitigated by design — `env:check` warns on a `file:`
`DATABASE_URL` in production. A warning, not a refusal: the production guard
that throws on a wrong backend is R-02's, for `PAYMENT_MODE`, and this one
deliberately did not copy it.
**Mitigation:** `env:check` warns when `DATABASE_URL` starts with
`file:` and `NODE_ENV=production`. Production deployments use
`postgres://`. The Drizzle schema is hand-written and the migration
path runs on both backends.

## R-07 — CORS misconfiguration in production

**Severity:** Medium
**Likelihood:** Medium
**Status:** Mitigated by design — the gate is `RequiredInProduction` in
`scripts/env-check.ts`, which errors when `CORS_ORIGINS` is unset in
production, plus the rule that rejects `*`. The schema is not the control.
**Mitigation:** `env:check` refuses to pass in production without
`CORS_ORIGINS`, and refuses `*` anywhere in production.

**This entry used to say the opposite about the schema**, and the sentence is
worth keeping in view: it claimed "the variable has no default there to fall
back to". `apps/api/src/config.ts` carries
`.default('http://localhost:5173,http://localhost:3000')` unconditionally, so a
process started in production *without* running the gate would serve those
origins — the default is not scoped to development. The exposure is small (a
browser at `localhost:5173` is the operator's own machine) and the gate does
cover the deploy path this repository ships, which is why this is a correction
and not a new risk. The lesson is the file's oldest one: a status line that
names a control has to name the file that carries it, because a control credited
to the wrong layer is a control nobody re-checks when that layer changes.

## R-08 — Prompt injection in README / source

**Severity:** Medium
**Likelihood:** High (the public web is full of these)
**Status:** Mitigated in 0.1.0-rc.2 by scoping. See below for what is still
not covered.
**Mitigation:** `security/injection.ts` reports; it never executes. The
system never takes instructions from target-repo content.

The detector has two scopes, deliberately different, and the difference
is what the 2026-10-01 audit taught it:

- **Instruction phrases** (22 of them) are looked for in prose documents
  only — `.md`, `.rst`, `.txt`, `.adoc`, and extension-less names like
  `README`. They match on word boundaries. Both halves matter: as
  substrings, `act as` read out of `contract as`, and a repository that
  audits smart contracts writes that constantly.
- **Role markers** (`system:`, `assistant:`) must open a line and be
  followed by content. As substrings they are a JSON key, a TypeScript
  type annotation, a log label — the self-audit flagged its own
  `llm/prompts.ts` over `{ system: string; user: string }`. That file was
  deleted in R-38; the rule and the test case stay, because they are about
  the shape of a line rather than about a file.
- **Invisible / bidi characters** are looked for in every file, source
  included. A bidi override in source is Trojan Source, and that is a
  source-level problem, not a prose one.

Before the scoping, the self-audit flagged eleven files and ten were
false. After it, four findings, all in the deliberately planted
`fixtures/prompt-injection/README.md`.

**Closed 2026-10-06 (R-38).** This used to read: "the audit prompt built in
`llm/prompts.ts` carries repository metadata (name, description) and no file
content, so the only text from a repository that can actually reach a model
today is its GitHub description — and that is not scanned." There is no audit
prompt and no model: R-38 deleted the provider, the prompt builder and every
call site, so no repository text reaches a model at all. The one remaining
path is `get_repository_context`, which returns a repository's description to
an *MCP client* — that client's model, not ours, and outside this detector by
construction rather than by omission.

## R-09 — Database file locked / migration crash

**Severity:** Low
**Likelihood:** Low (better-sqlite3 is single-writer, fine for one API)
**Status:** Mitigated by design — the migration runs inside one explicit
transaction and every `CREATE` is `IF NOT EXISTS`, so a crash mid-migration
leaves a database the next run finishes rather than one it cannot read. The
column adds are the exception and rely on try/catch instead (see below).
**Mitigation:** The whole migration runs inside one explicit transaction:
`db.raw.exec('BEGIN')` … `COMMIT`, with `ROLLBACK` in the catch
(`apps/api/src/db/client.ts:122-207` for SQLite, and the Postgres branch below
it). It is **not** `db.transaction`, which is what this entry used to say and
what no code in this repository calls. Every `CREATE TABLE` is `IF NOT EXISTS`.
The SQLite `ALTER TABLE jobs ADD COLUMN …` statements (`:150-164`) have no
`IF NOT EXISTS` — SQLite has no such form — so each is executed inside its own
try/catch, and that loop (`:166-174`) is what makes a re-run safe. The Postgres
branch does not need the trick: its adds are `ADD COLUMN IF NOT EXISTS`
(`:243-254`).

## R-10 — Log redaction bypass

**Severity:** Medium
**Likelihood:** Low
**Status:** Mitigated by design — `redact` is configured on the Fastify logger
and on the shared pino factory. The integration test this entry used to claim
does not exist; the entry is the reason to say so out loud rather than quietly
dropping the sentence.
**Mitigation:** `redact` is set in two places that have to stay in step —
`apps/api/src/server.ts:110-122` and `apps/api/src/utils/logger.ts:9-22` — and
they are **not** in step: the pino factory redacts `*.xPayment` and the Fastify
logger does not. Nothing tests either list. There is no test that POSTs a known
fake secret and asserts it is absent from captured logs, and this entry claimed
that test was "part of the suite" — a control asserted in a document and absent
from the tree, which is R-36's shape with the polarity reversed.

**Detection:** None. The redaction is a config line someone has to keep, which
is the thing the entry used to say it was not.

## R-11 — Marketplace hero / branding not provided

**Severity:** Low
**Likelihood:** Confirmed at the time — retracted, see below.
**Status:** Fixed — both assets are committed and `pnpm preflight:production`
measures them. This entry was the last place still reporting the blocker.

**What it was.** This entry read: *no brand asset*, documented in
`docs/HERO_IMAGE_BRIEF.md` and marked `EXTERNAL_BLOCKED` in
`docs/EXTERNAL_ACTIONS.md`, the release candidate proceeding without it. Both
halves were stale by the time anyone could have read them. `docs/brand/hero.png`
(1280 × 640, measured) landed in the same change that wrote this entry —
`f95ccb5` — and `docs/brand/avatar.png` (1024 × 1024, for
`onchainos agent create --picture`) landed 2026-10-05.
`docs/EXTERNAL_ACTIONS.md` §7 has recorded the item as `DONE` since, and says
why in its own words: the item *"claimed no brand asset was bundled. That
stopped being true when `docs/brand/hero.png` was committed — the item was never
updated."*

**Why it is kept rather than deleted.** The defect was never the missing image.
It was that two documents disagreed about whether one existed, and nothing
compared them: this entry was compared to nothing. The pair that *is* compared
is the committed file and the brief — `checkAsset()` in
`scripts/preflight-production.ts` re-measures both assets against the ratio the
brief specifies — which is R-36's answer applied to a PNG.

**Related.** R-36 (a document cannot disagree with a function it is never
compared to), D-033 (a document states no fact it can derive).

## R-12 — PII leakage from the audited repo

**Severity:** Low
**Likelihood:** Low
**Status:** Mitigated by design — evidence is a pointer (`file`, `line`,
`reason`), not a copy of the file, and the one field that could carry text is
populated by nothing. The pointer field is `file`, not `path`.
**Mitigation:** `EvidenceSchema` is
`{ file, line, reason, source?, excerpt?, reproducible? }`
(`packages/core/src/schemas/report.ts:31-52`) — a pointer, not file content.
It also has an `excerpt`, and this entry used to deny that any such field
existed: "The matching text, truncated and redacted. MUST NOT carry a full
secret: `security/redact.ts` is the only thing allowed to build one"
(`report.ts:44-48`). Two things are wrong with that sentence and both are worth
naming, because it is the only statement of the constraint. **`security/redact.ts`
does not exist** — nothing in `packages/core/src` imports it, and the schema
comment is its only mention in the repository. And the constraint it states is a
comment, not a type. What actually keeps this risk small is that nothing
populates the field: `excerpt` appears in `packages/core/src` only in the schema
and in `findings.test.ts`, always as `null` or absent. The control that does
exist and is tested is upstream of the report: `scanForSecrets` never carries a
raw value into a draft, and `secret-scanner.test.ts:5-17` asserts the matched
key does not appear anywhere in the serialised finding.

## R-13 — A gate on a large repository times out

**Severity:** Low
**Likelihood:** High for large repos
**Status:** Mitigated by design — the per-request timeout and the published
limits are the control, and the queue is what keeps a gate off the request path.
The residual is R-16's: the queue is in-process, so a restart loses a gate that
was already accepted.
**Mitigation:** 30 s per-request timeout in the fetcher
(`packages/core/src/git/fetcher.ts`). The size limits that bound a gate are
published in `/api/v1/capabilities.limits`, which reports what this
deployment is configured with (`MAX_FILES`, `MAX_FILE_BYTES`,
`MAX_TOTAL_BYTES`, `RATE_LIMIT_PER_MINUTE`; the library defaults are 2000
files, 1 MiB per file, 50 MiB total). The gate is queued rather than
synchronous — see R-16
for the durability caveat. This entry used to be titled "Long-running `full`
audits time out", which named a mode dependence that does not exist: both
modes read the same archive and the same commit history, so the repository's
size is what bounds a gate, not the mode (R-30, D-035).

## R-14 — A Docker build that needs GitHub Releases to be reachable

**Severity:** Low
**Likelihood:** Confirmed on a network with no route to GitHub Releases
**Status:** Fixed 2026-10-06.

**What it was.** `better-sqlite3` ships a prebuilt binary and `pnpm install`
uses it when it can. `prebuild-install` looks for that binary on GitHub
Releases; when the download fails the package falls back to `node-gyp`, which
needs a toolchain. The `builder` stage is `node:22-alpine`, which ships no
compiler and no Python, so the fallback could not run and the build died:

    gyp ERR! find Python You need to install the latest version of Python.
    gyp ERR! stack Error: Could not find any Python installation to use

The message names the tool that is missing, not the download that failed, so
it reads as "this image lacks a build dependency" when the image was fine and
the network was not. Nothing had ever caught it: CI's runners reach GitHub
Releases at internal-network speed, so the fast path was the only path that
had ever run — and the deployment this is aimed at is a mainland-China VPS,
which is the network where it fails.

**Mitigation:** the `builder` stage installs the toolchain
(`apk add --no-cache python3 make g++`, ~200 MB in a stage that is not part
of the final image — that is the Dockerfile's own figure, `Dockerfile:37`; this
entry said ~300 MiB and nothing ever compared the two). The fast path is
unchanged; the slow path now succeeds
instead of dying. Verified by building the image on an x86_64 host with no
route to GitHub Releases: `prebuild-install` failed, `node-gyp rebuild` ran,
and the build completed.

**Also corrected here.** This entry used to read "Docker sandbox not available
in dev", and that was true when it was written. Docker 29.8.2 and Colima
0.10.3 are installed under `/usr/local` — just not on `PATH` — and the daemon
runs, so `pnpm docker:check` now performs its build half here instead of
skipping it. That is how this defect was found. `PROJECT_STATE.md` carries the
same correction.

## R-15 — User shares real OKX keys in chat

**Severity:** Critical
**Likelihood:** Low
**Status:** Mitigated by design — `env:check` never prints a value, and the one
document that talks about handling the keys says not to paste them. Nothing
technical stops a human from pasting one into a chat window.
**Mitigation:** `env:check` never prints secret values — the known secret keys
are reported by name, never by value (`scripts/env-check.ts:218-223`). The
warning against pasting is in `docs/EXTERNAL_ACTIONS.md:113` ("Do not paste the
keys into chat, issues, or commits") — not in `README_OKX.md` or
`docs/SECURITY.md`, which this entry used to name; `docs/SECURITY.md:116` covers
the same ground without the instruction. And the docs do **not** use a
`__OKX_AGENT_KEY__` placeholder: that string appears nowhere in the repository
outside this entry, so the placeholder was the entry's invention rather than the
control it described.

## R-16 — Inline audit queue used in production (in-process, no durability)

**Severity:** High
**Likelihood:** Low (with proper guards)
**Status:** Mitigated in 0.1.0-rc.2.

**Mitigation:** `NODE_ENV=production` with `AUDIT_QUEUE_DRIVER=inline`
fails the application start: `validateProductionConfig()` pushes the issue
unconditionally and throws (`apps/api/src/config.ts:146-151`), and `pnpm env:check`
reports the same combination as an error (`scripts/env-check.ts:168-170`).
There is **no** `ALLOW_INLINE_QUEUE_IN_PRODUCTION` escape hatch. This entry,
D-016 and the rc.2 notes in `CHANGELOG.md` all describe one; it appears in no
source file in the repository. Production cannot run the inline queue, full stop.

**Detection:** `/health` reports `queue.driver`. Operators should alert if it
reports `inline` in production.

## R-17 — Tarball extraction exhausts disk / memory

**Severity:** Medium
**Likelihood:** Medium (introduced by D-017 in V0.2)
**Status:** Mitigated by design — the two caps are the control, and the disk
half of the risk does not exist as built: decompression is in memory (D-024), so
there is no directory to exhaust. The residual is the API host's memory, which
`MAX_EXTRACTED_BYTES` bounds and nothing else does.

**Mitigation:** The disk half of this risk does not exist as built —
ADR D-024 superseded the `mkdtemp` detail and the archive is
decompressed in memory, so there is no directory to exhaust and nothing
to clean up in a `finally`. What replaces it is a pair of caps in
`git/fetcher.ts`: `MAX_ARCHIVE_BYTES` (64 MiB compressed, checked
before decompression) and `MAX_EXTRACTED_BYTES` (256 MiB, enforced by
zlib's `maxOutputLength`, which is what stops a small archive from
expanding into a gigabyte). The existing `maxTotalBytes` (50 MiB) still
caps the *decoded text*; extraction aborts once it is reached and
reports `truncated` rather than falling back, because what has been
read is still what was asked for. `filterFiles` runs before any file is
read, so noise directories are never materialised, and a file not on
the wanted list is never decoded at all. No `spawn` is performed on
extracted content (D-007). If extraction fails at any point — including
an archive that parses cleanly but holds none of the listed files,
which is how a moved ref would present — we fall back to the per-file
`getContent` path and mark the result `degraded`.

**Detection:** The fetcher logs `fileCount`, `extractedBytes`,
`archiveRoot`, `missing` and `truncated` on every tarball read, and
`degraded` plus the reason whenever it falls back. A tarball read that
yields few files but a non-zero `missing` is the signal that the
archive and the tree disagreed. `/tmp` usage is no longer an operator
signal for this risk; memory on the API host is.

## R-18 — AST parsing OOM on a pathological file

**Severity:** Low
**Likelihood:** Low (introduced by D-018 in V0.2)
**Status:** Mitigated by design — the size check runs before the parser, and a
parser that throws degrades one file instead of the map. The residual is a file
under the cap that is pathological in some other way, which the try/catch
catches and the fallback answers with less precision rather than an error.

**Mitigation:** Every file is checked against `maxFileBytes`
(1 MiB) before parsing. Each parser call is wrapped in try/catch and
degrades to the regex fallback on any error. Parsing is synchronous
per file with no cross-file state, so a single failure cannot poison
the map. `SymbolMapSchema.failures` records every degraded language
with its reason.

**Detection:** `SymbolMapSchema.degraded === true` or a non-empty
`failures[]` in the output. Unit tests assert that a malformed file
produces `degraded: true` rather than a throw.

## R-19 — Compare API returns a truncated diff

**Severity:** Low
**Likelihood:** Medium for very large pull requests (V0.4, D-020)
**Status:** Open — and the mitigation this entry used to state described a class
that is not in the tree. Nothing reads the Compare API, so the risk is dormant
rather than handled.

**What this entry used to claim, and why it was wrong.** It read: *"`GitHubCompareSource`
checks the Compare API response for the truncated flag and file-count cap. When
truncation is detected, `ChangeImpactSchema.degraded` is set to `true` …"*.
There is no `GitHubCompareSource` anywhere in the tree. `octokit.repos.compareCommits`
is never called; no `ChangeSource` implementation exists outside a comment in the
schema; and nothing produces a `ChangeImpactSchema` — the fourteen MCP tools and
the five API route modules (`audits`, `audit-derived`, `capabilities`,
`free-check`, `health`) contain nothing that reads a Compare API response. What
does exist is
the schema (`packages/core/src/schemas/intelligence/change-impact.ts`), which
carries `degraded` and `limitations` for whoever builds the source.

**So the risk is dormant, not handled.** Nothing reads the Compare API, so
nothing can return a truncated diff today; the moment something does, the flag
is unread and the failure is silent. This entry is the reason the mitigation for
a source has to be written when the source is, and not when the schema is.

**Detection:** the one this entry names — a `change-impact` response with
`degraded: true` and a `limitations` entry mentioning truncation — is a
detection that cannot fire, because nothing emits one. That is R-27's shape (a
check that can never pass is indistinguishable from one that found nothing), and
it is the second reason the Status is *Open* rather than *Fixed*.

**Related.** R-27 (a check that can never pass), R-28 (a green tick over a
capability the repository does not have), D-020 (the `ChangeSource`
abstraction).

## R-20 — Intelligence artifacts inflate `report_json`

**Severity:** Medium
**Likelihood:** Medium (V0.3+, if artifacts are embedded by default)
**Status:** Mitigated by design — nothing embeds the map, so there is nothing to
inflate yet, and the caps are there for the caller that eventually does. Two
tests this entry used to name are in the wrong place and one cap reports
nothing; the entry says so rather than dropping the claims.

**Mitigation:** Per D-021, intelligence artifacts are **not** embedded
in `Report` by default. V0.2-d went further and did not wire the
Repository Map into the pipeline at all, so today nothing embeds it and there
is nothing to inflate. The builder is capped regardless, so an embedding
caller cannot blow up `report_json` by accident: `MAX_MODULES` 200,
`MAX_ENTRYPOINTS` 50, `MAX_LISTED_FILES` 300, `MAX_DEPENDENCIES` 500,
`MAX_IMPORTANT_FILES` 60. Four of those five caps report themselves, from two
places. `buildLimitations()` emits a line naming the cap and the true total for
three of them (`packages/core/src/intelligence/repository-map/build.ts:481-491`).
The fourth, `MAX_MODULES`, is reported by `detectModules`, the only thing that
knows the true total
(`packages/core/src/intelligence/repository-map/modules.ts:240-242`);
`buildLimitations` says so in a comment instead of restating the line
(`build.ts:494-496`). So a truncated map cannot be mistaken for a small one.
**`MAX_IMPORTANT_FILES`
is the exception**: it truncates at `build.ts:425` with a bare `slice(0, 60)`
and contributes no `limitations` line, so an `importantFiles` list cut to 60
is indistinguishable from one that had 60. That is the one cap in this entry
that bites silently, and this entry used to claim all five reported. When a
caller explicitly requests embedding, the MCP tool applies token trimming
before returning (`packages/mcp-server/src/intelligence.ts:304-430`).

This entry also used to say the artifacts "live in the `intelligence_cache`
table and are served from dedicated endpoints / MCP query tools". There is no
`intelligence_cache` table — `runMigrations` creates `jobs`, `report_cache` and
`burned_nonces` and nothing else (`apps/api/src/db/client.ts:125,182,199`) — and
the route modules above hold no intelligence endpoint. The claim was about
storage that was never built.

**Detection:** Track `jobs.report_json` row size; alert on outliers.
The byte-budget integration test this entry used to describe does not
exist and was removed rather than left standing — it belongs to V0.2-g,
when something actually embeds the map. The caps that *are* pinned are pinned in
`build.test.ts`, not in `fixture.test.ts` as this entry used to say:
`build.test.ts:324-384` is a `describe('… caps are reported only when they
bite')` block that asserts both that the list is cut and that a cap which
does not bite says nothing. `fixture.test.ts` runs the builder over every
fixture on disk — the suite asserts there are at least six — and asserts the
schema, reproducibility, that every named path exists, and that each module is
accounted for; it makes no cap assertion at all.

## R-21 — New dependency breaks the zod / MCP SDK pins

**Severity:** Medium
**Likelihood:** Medium (V0.2+, whenever a dependency is added)
**Status:** Mitigated by design — and half of the mechanism this entry claimed
did not exist. `pnpm-workspace.yaml` `overrides` pinned zod; it did **not** pin
the MCP SDK, which was pinned only in `packages/mcp-server/package.json` — the
one package that declares it. Both are in `overrides` as of 2026-10-08.

**Mitigation:** D-003 pins zod to `^3.24.1` and the MCP SDK to exactly
`1.22.0`; `pnpm-workspace.yaml` enforces both via `overrides` — the caret is
D-003's decision and the override is what makes it hold. Any new
dependency must not transitively pull zod >= 3.25 or MCP SDK >= 1.23
(the mirror cannot resolve `zod/v3`, and the newer SDK changes the
`tool()` signature). The `typescript` compiler API promotion in D-018
is safe: it is already present at `^5.7.2`.

**Why the override, and not the `package.json`.** Four packages declare
`"zod": "^3.24.1"`, and a caret range is precisely the thing that drifts — the
override is what makes the pin hold for a package that does not exist yet. The
MCP SDK has one declarer today, so its exact `package.json` entry was doing the
work, but that is a fact about the tree rather than a control, and the sentence
above claimed the control. It is in `overrides` now, which is what the sentence
said all along.

**Detection:** CI runs `pnpm install --frozen-lockfile`
(`.github/workflows/ci.yml:115-116`), then `pnpm lint` (`:139-140` — which since
R-31 type-checks the five workspaces *and* `scripts/`) and `pnpm -r typecheck`
(`:142-143`). A resolution or type failure is the gate. Reviewers
must reject PRs that move these two pins without an accompanying ADR.

## R-22 — A lockfile drives `securityHygiene` to 0

**Severity:** High
**Likelihood:** Certain (measured, not theorised)
**Status:** Mitigated in 0.1.0-rc.2 by ADR D-022. The penalty is capped per
`(file, rule)` at 3 findings, so one generated file can no longer zero a
dimension. Breadth is unaffected.

A lockfile is mostly integrity digests — `sha512-<base64>` — which are
high-entropy by construction, which is exactly what the generic secret
heuristic looks for. `security/severity.ts` downgrades those hits rather
than skipping them, so the *quality contract* stops counting them (it
only counts `critical` and `high`). The **score** does not.

`scoring/score.ts` sums `SEVERITY_PENALTY[f.severity]` over
`securityFindings`, and `low` is 1.5, not 0. The findings are never moved
out of `securityFindings`, so they still accumulate there.

Measured on a synthetic repository whose only files were a
`pnpm-lock.yaml` with 400 integrity digests, a one-line `src/index.ts`, a
README and a LICENSE:

```text
securityFindings: 389   (388 low from pnpm-lock.yaml, 1 medium from .gitignore)
fixtureFindings:    0
securityHygiene:    0
overall:         44.9
```

388 × 1.5 = 582 points of penalty against a base of 100, clamped to 0. A
repository whose only sin is having a lockfile scores zero on security
hygiene, and the overall score lands at 44.9. (The delta against a
lockfile-free run of the same tree was not measured — the other
dimensions are not all 100, so 44.9 is the observed value, not the size
of the loss.) This is the same class of defect as the 547-blocker
`.env.example` run that motivated `TEMPLATE_ONLY_KINDS`, one layer
further out: the gate was fixed, the score was not.

Note what does *not* fix it. `fixtureSummary` groups `fixtureFindings`,
which by construction excludes lockfiles and documents, so it does not
touch this. Neither does lowering `SEVERITY_PENALTY.low`: the count is
unbounded, so any non-zero weight still reaches 0 on a large enough
lockfile.

**Fix applied (ADR D-022):** cap the contribution of any one
`(file, ruleId)` pair, rather than removing lockfile findings from
`securityFindings`. The 388th `sha512-` digest carries no information the
first did not, and a cap is principled for every rule rather than a
special case for lockfiles. Moving generated-file findings into
`fixtureFindings` would also work, but it changes what
`securityFindings` means and raises the score for every affected
repository — a bigger semantic change than the cap.

**Detection:** the probe above, now pinned in both directions by
`packages/core/src/scoring/penalty-cap.test.ts`: a lockfile cannot zero
`securityHygiene`, and forty files with one hit each still score 40 — the
second half matters as much as the first, since a cap that also flattened
breadth would trade a false alarm for a false pass. Reverting the cap
fails 7 of the file's 8 tests.

**Fixed:** ADR D-022 caps each `(file, ruleId)` pair at `MAX_PER_GROUP`
(3) findings, worst severity first, keyed on the *resolved* rule id — a
secret finding's `id` embeds its line number, so keying on it would give
every hit its own group and the cap would never apply. Measured after the
fix, same synthetic repository: `securityHygiene: 95.5`, and the overall
score moves 1.1 points instead of 25.

## R-23 — Two hits of one rule on one line share a fingerprint

**Severity:** Medium
**Likelihood:** Low — needs two credential patterns to match one line, and
a contract that tolerates at least one credential
**Status:** Mitigated in 0.1.0-rc.3 for the quality gate by ADR D-023. The
diff still collapses them, deliberately and by schema.

A fingerprint is resolved rule id plus evidence locations, and it is
meant to be coarse so that a finding which only moved does not read as
one fix plus one new problem. The consequence is that two *different*
hits of one rule at one `file:line` are one fingerprint.

That is reachable from the scanner as written. `scanTextForSecrets()`
emits one hit per matching `PATTERNS` entry with no per-line dedupe (the
entropy heuristic is the only one that checks the line, at
`secret-scanner.ts:351`), and `toSecretFindings()` dedupes on
`file::kind::line`, so two *different* kinds survive. Every `secret-` slug
resolves through the registry's `secret-` prefix to the single rule
id `SEC-SECRET-001`. That is true of the two slugs in question and not of
`secret-` as a family: `secret-history-` is a longer prefix and resolves to
`SEC-HISTORY-001`, because matching is longest-prefix-first
(`packages/core/src/findings/rule-registry.ts:150-166`). One line carrying an AWS key and a Stripe
key is therefore two findings with two ids and **one** fingerprint:

```text
id=secret-aws_access_key-1-src-config-ts   fingerprint=6537623962375d80
id=secret-stripe_live_key-1-src-config-ts  fingerprint=6537623962375d80
```

`collectFindings()` deduplicated on that fingerprint, and
`securitySection` compares the resulting count against
`security.maxSecrets`. With `maxSecrets: 1` the two credentials were
counted as one, `1 <= 1` held, and the check reported `1 credential
found` with status `pass`. The default contract sets `maxSecrets: 0`, so
one surviving credential still fails it — the false pass needed a
non-default `maxSecrets` or `maxCritical`, which is what keeps this at
Medium rather than High.

**Detection:** the two ids above are pinned in
`packages/core/src/quality/contract.test.ts`
under `finding collection` (`:334-356`). Both tests fail if the key reverts to
the fingerprint alone — the count test reports length 1 instead of 2, and the
contract test reports `pass` where `fail` is required. One caveat, and it is
R-35's: only `enrichFinding` is real in that helper. The two ids are hand-written
literals passed to `makeFinding`, and the scanner is never called — the helper's
own docstring says it builds them "as the scanner actually emits them"
(`:329-333`), which is a claim about fidelity that nothing checks. If
`toSecretFindings` changed its id format, both tests would keep passing.

**Fixed:** ADR D-023 keys `collectFindings` on `(findingKey, id)`, which
is strictly finer than the fingerprint alone. The gate now counts what
the report lists.

**Accepted residual, by design:** `diffReports` keys on the fingerprint, so two
hits removed from one line read as `resolved: 1`, and a report that added
a second credential to a line already carrying one reads as `persistent`
with no change. This is not an oversight to be fixed the same way:
`AuditDiff.resolved` and `.new` are documented as arrays of fingerprints,
so a finer key is a schema change, and "is this problem still at this
place?" is genuinely answered by the coarse key. A caller that needs the
count should read `Report.securityFindings`, not the diff.


## R-24 — A reverse proxy that omits `X-Forwarded-For` disables rate limiting

**Severity:** High.
**Status:** **Fixed 2026-10-16 — the key is the socket peer, not `req.ip`,
and the allow-list is no longer reachable by writing a header.** The three
follow-ups that first pass left behind were closed the same day: the shipped
compose stack named loopback while its edge arrived over the bridge, which
was a live shared-bucket outage until a second pass pinned the address; the
key generator took the right-most header entry, which silently collapses
every caller behind a second trusted hop and was one deployment away from
being shipped; and `trustProxy: true` let `req.ip` follow the header from
anyone, which no longer has a reader today but was a loaded gun pointed at
the next one. `server.ts` now passes `cfg.TRUSTED_PROXY_IPS` instead, so
`req.ip` and the limiter agree by construction. What remains is one design
choice rather than a defect — a *trusted* proxy that omits the header exempts
its own traffic, backstopped by configuration and by a gate — and it is
described below as such.

The `keyGenerator` used to read the header first and `req.ip` as a
fallback, and the `allowList` was matched against the **key**, not
against `req.ip` (`@fastify/rate-limit@10.3.0` does
`params.allowList.indexOf(key)`, `index.js:233`). Two doors followed:

1. **The forgeable one.** `apps/api/src/server.ts` set `trustProxy: true`,
   so Fastify believed `X-Forwarded-For` from anyone — and `req.ip` followed
   it. Any client that could reach the API directly could send
   `X-Forwarded-For: 127.0.0.1` and be exempt from the limit entirely, or a
   fresh random value per request and reset the bucket every time. Both
   were the same defect: the "client address" was a header the client wrote.
2. **The silent one.** A proxy that forwards the request **without**
   `X-Forwarded-For` leaves `req.ip` equal to the proxy's own address. When
   the proxy runs on the same host as the API — the shape both
   `docs/deployment/nginx.conf.example` and `Caddyfile.example` describe —
   that address is `127.0.0.1`, the allowListed entry, and every request
   then matches the allowList. Nothing logs a warning; the limiter simply
   stops limiting.

**What the fix is.** `registerRateLimit` now takes `trustedProxyIps` (the
new `TRUSTED_PROXY_IPS` env var, defaulting to loopback) and keys on the
socket peer — `req.socket.remoteAddress`, the one address this process did
not read off the request. `req.ip` is deliberately not used, for the reason
in door 1. When the peer *is* a configured trusted proxy, the key is the
first `X-Forwarded-For` entry found walking in from the right that is **not**
also one of ours: every address a proxy we run appended is skipped, and the
first one left is the client. The left-most entry is what the client claimed
about itself, and a client can claim anything.

Walking rather than taking the right-most entry is not decoration, and this
is the part the first pass got wrong. The right-most entry is what the *last*
proxy appended. With two hops we run — a load balancer in front of the edge,
a normal deployment — that is the balancer, so every caller behind it lands
in one bucket. That is the same outage as the compose miswiring below,
reached from the other direction, and it was one deployment away: the first
pass shipped the claim "keys on the *right-most* entry" in three deployment
files — `deploy/nginx/repopilot.conf`, `docs/DEPLOYMENT.md` and
`docs/deployment/Caddyfile.example` — true of the one-hop topology each of
them described, and false the moment anyone added the load balancer those
same files already told them to put in front. With one hop the walk returns
exactly what the right-most entry did, so nothing about the shipped topology
changed.

The `allowList` is now `[...trusted]`, matched against a key that is the
peer unless the peer is trusted — so writing `X-Forwarded-For: 127.0.0.1`
from an untrusted peer keys the caller by their own address and limits them
like everyone else. Eight tests in
`apps/api/src/middleware/rate-limit.test.ts` drive the real plugin through
`app.inject` with a faked socket peer: the peer budget, a forged header, the
right-most entry with one trusted hop, the walk past two, the
all-hops-are-ours fallback, the header-forged allow-list, the proxy's own
exemption, and both directions of the compose edge. The walk is pinned by
mutation rather than by reading: replacing it with the old right-most
selection fails exactly one test and leaves the other seven green.

**The one residual, and why it is a choice rather than a defect.** A
*trusted* proxy that forwards no `X-Forwarded-For` still keys every request
by the proxy's own address, and the proxy is allowListed — so the limiter is
off for that traffic, exactly as it was before the fix. This is deliberate,
and it is the whole reason the allow-list exists: our own proxy reaching us
directly (health checks, internal calls, the compose edge talking to the API)
is not a client to throttle, and the process cannot tell "my proxy, no client
to report" from "my proxy, forgot the header". Every fix that removes the
exemption removes it for the health check too.

So the residual is not closed in code; it is **backstopped in two parts**,
and the two parts are only useful together:

1. **Configuration names the proxy.** The exemption is no longer reachable by
   accident. It requires an operator to have written the proxy's address into
   `TRUSTED_PROXY_IPS`; the default is loopback, which is the built-in
   compose topology's *edge* address only because the second pass pinned it.
   A deployment behind nginx or Caddy sets the variable to the proxy's
   address, or every client is keyed by the proxy and shares one bucket —
   an availability failure, not a bypass, and `.env.example` says so with
   that caveat.
2. **A gate holds the configuration in place.** `scripts/compose-check.ts`
   fails the build if the header line is removed, if the API is re-published
   on every host interface, if the subnet stops being pinned, if `web`'s
   pinned address and `api`'s `TRUSTED_PROXY_IPS` stop naming the same
   `${REPOPILOT_EDGE_IP:-172.28.0.10}` literal, or if `api`'s `HOST` stops
   being `0.0.0.0` (a dual-stack listener reports the peer as
   `::ffff:<addr>`, which would not match and would reproduce the shared
   bucket silently). Seven mutations of `docker-compose.yml`, one per way to
   break the wiring, each exit 1 with the message it is designed to produce.

Part 1 without part 2 is a comment nobody reads; part 2 without part 1 would
be gating a value nobody needs. `deploy/nginx/repopilot.conf` sets
`X-Forwarded-For $proxy_add_x_forwarded_for` with a comment saying why the
line must not be removed, and `docker-compose.yml` publishes the API on
`127.0.0.1:4000:4000` so the direct-reach door stays shut. The behaviour
itself is pinned by
`exempts a trusted proxy that forwards no X-Forwarded-For` in
`apps/api/src/middleware/rate-limit.test.ts` and by
`keys on the peer when every hop in the chain is one of ours`, so a change
that quietly stopped exempting the proxy — and therefore started throttling
our own health checks — would fail the suite rather than the deployment.

**The first pass shipped a hole of the same shape, and a second pass closed
it.** The fix above added `TRUSTED_PROXY_IPS` and then left the shipped
compose stack unset, reasoning that loopback is what that stack uses. It is
not. `web` proxies to `upstream repopilot_api { server api:4000; }` over the
compose bridge, so the API's peer is nginx's *container* address, and the
loopback default matched nothing — which is not the exempt case but the
opposite one. The peer was untrusted, so the key was the edge's address, and
**every caller of the deployment shared one 60/min bucket.**

Measured rather than reasoned, because the two readings differ by exactly
the thing that was assumed: a three-container probe of the real topology
(`node` sink bound to `0.0.0.0:4000` behind the `nginx:1.30-alpine` image,
on the repository's own subnet and address) reports `PEER=172.28.0.10`, and
the same probe with the pinning removed reports `PEER=172.21.0.3` on a
daemon-chosen `172.21.0.0/16`. The peer is a bridge address either way —
never loopback — and without the pin it is one no trust list can name in
advance. That is the whole reason the address is now pinned rather than
assumed: the default network states its subnet, `web` states its address on
that subnet (`web.networks.default.ipv4_address`), and `api`'s
`TRUSTED_PROXY_IPS` names the same `${REPOPILOT_EDGE_IP:-172.28.0.10}`
literal.

`scripts/compose-check.ts` fails when any of those three disagree. The gate,
what it checks, and its seven mutations are set out under "The one residual"
above rather than repeated here.
`apps/api/src/middleware/rate-limit.test.ts` pins both directions of the
mechanism: with the edge's address named, two callers get two buckets; with
the built-in default, the same two collapse into one.

**The third follow-up: `trustProxy` now names the same list.** `server.ts`
used to set `trustProxy: true`, which makes `req.ip` follow
`X-Forwarded-For` from anyone — measured rather than inferred: with that
setting, a peer that was not trusted sending `X-Forwarded-For: 1.2.3.4` got
`req.ip = 1.2.3.4`, an address the caller typed. Nothing read `req.ip`, so
the effect was nil, and the loopback-only published port was the only thing
keeping it that way. A loaded gun rather than a wound.

The first pass left it, on the argument that changing the behaviour of a
value no code path reads is a decision for whoever reads it next. That
argument does not survive the measurement. With `trustProxy: true` the next
reader of `req.ip` gets an address the client chose and has no way to know
it; a value that is wrong today and will be believed tomorrow is not neutral,
it is a trap laid for a colleague. So `server.ts` now passes
`cfg.TRUSTED_PROXY_IPS` — the same list the limiter uses — and `proxy-addr`
walks in from the socket, skips every address we run, and stops at the first
one we do not. A forged left-most entry is discarded rather than believed:
peer `172.28.0.10` with `X-Forwarded-For: 1.2.3.4, 203.0.113.9` yields
`req.ip = 203.0.113.9`, the entry the edge appended, which is the same value
the limiter keys on. An empty list is the safe direction — nothing trusted,
so `req.ip` is the socket peer — which means an operator who names no proxy
gets the conservative reading rather than the permissive one.

Pinned as behaviour rather than as a stored option:
`apps/api/src/tests/api.integration.test.ts` registers a `GET /__ip` route in
its `beforeAll` and asserts that a forged header from an untrusted peer is
ignored, and that a trusted peer's header yields the entry the edge appended.
The option itself is not readable from outside — `app.initialConfig` carries
only a fixed subset and the validated options sit behind a private symbol —
which is just as well, because the behaviour is the part that matters. A
one-word revert to `true` now fails that test instead of passing silently.

**Why it is High rather than Low.** R-03 is the reason the limiter exists at
all: anonymous GitHub access is 60 requests/hour per IP, and the four free
tools inherit that budget. With the limiter off, one caller can exhaust the
shared budget and take the service down for everyone, and the failure looks
like GitHub rate limiting rather than like a misconfiguration.

## R-25 — A healthy container can be serving an unmigrated database

**Severity:** High
**Likelihood:** Likely — every fresh deployment starts in this state
**Status:** Accepted residual — decided, not deferred. See below.

**What happens.** `/health` answers HTTP 200 in both the good and the bad
state; only the body distinguishes them. `status: 'ok'` requires `dbOk &&
queue.status === 'ok' && queue.acceptingJobs`
(`apps/api/src/routes/health.ts`), and `dbOk` is a real query —
`repo.list(1)`. Against a database with no schema that query throws, the body
says `degraded`, and the response is still `200 OK`.

So a deployment whose database has never been migrated looks healthy to
everything that checks liveness by status code:

- `docker compose ps` — healthy (the API healthcheck is `r.ok ? 0 : 1`).
- A Railway, Render or Kubernetes readiness probe pointed at `/health` — ready.
- A load balancer — in rotation.

…while every audit POST fails at the database layer. The operator sees a
running stack and a product that does not work, and the two facts do not
obviously share a cause.

**Why this is recorded even though compose now enforces it.** D-031 fixed the
compose path by turning the bootstrap into a job that `api` and `worker` wait
on. Three of the four documented deployment shapes are not compose: Railway,
Render and the plain-VPS install all require the operator to run
`node apps/api/dist/db/migrate.js` (or `pnpm db:migrate`) before the API takes
traffic, and nothing in the application says so if they forget. The condition
was also live until 2026-09-29, including in the docs — which presented
`docker compose up -d` as the whole procedure.

**Mitigation.**

1. `docker-compose.yml` runs the bootstrap as a one-shot job and gates `api`
   and `worker` on `service_completed_successfully` (D-031).
2. `scripts/compose-check.ts` fails if that ordering is removed — from either
   service, with the wrong command, or with a server-style restart policy.
   Four mutations, all caught.
3. `docs/DEPLOYMENT.md` names the step in every platform section that needs
   it, and describes what the failure looks like when it is missed.

**Why it is accepted, and what would change it.** Mitigated on the compose
path by D-031 and documented in every platform section of
`docs/DEPLOYMENT.md`; the deliberate 200 is recorded as a rejected alternative
in D-031, so this is not a piece of unfinished work — it is a decision with a
known cost.

Nothing in the API distinguishes "I cannot serve" from "a probe failed", so no
status-code-only check can detect this class. Changing that is a larger
decision about what `/health` means, and it is a decision about the *product's*
public contract, not about this gate: a readiness endpoint that answers 503
until the schema is migrated is a different product promise from one that
always answers 200 and puts the truth in the body. **The trigger to revisit it
is the first non-compose deployment** — the first Railway, Render or plain-VPS
install that someone other than us operates. Until there is one, the operator
is the mitigation.

## R-26 — A check that never runs is indistinguishable from one that passes

**Severity:** High
**Likelihood:** Certain — it has already happened five times in this repository

**What happens.** A green dashboard means "nothing that ran found a problem",
which is not the same claim as "nothing is wrong". When the thing that would
have found the problem never executes, the two are visually identical, and the
gap is invisible precisely because the instrument that would report it is the
one that is missing.

Three instances, each found independently and each having survived review:

1. **`apps/web` had no tests.** Its `test` script printed `no web tests yet`
   and exited 0, so `pnpm -r test` reported success for a workspace with no web
   coverage at all. The bug that made the submit button a silent no-op lived
   there undetected from the first commit (2ea445d).
2. **`.github/workflows/docker.yml` was PR-only.** The repository has had no
   pull requests, so the only workflow that builds an image had never run on
   `main`. The image did not build — `FROM node:20-alpine` against
   `pnpm@11.11.0`, which needs Node 22 — and had not since the initial import.
   Adding `push:` surfaced it in 17 seconds.
3. **`docker:check`'s static half could not fail.** `err` printed a red ✗ and
   the script still exited 0, so every assertion in it, including "the
   Dockerfile is present", was advisory. It was also not wired into CI at all,
   so nothing ran it either way.

**Why this is High rather than Low.** Each instance hid a real defect, and two
of the three had been shipping since the initial import. The failure mode is
self-concealing: the more thorough a check looks in the file, the less likely
anyone is to ask whether it ever executes.

**Mitigation, and the rule that follows from it.**

1. `docker.yml` runs on push as well as PR.
2. `compose:check` and `docker:check` are both steps in `ci.yml`, so they run
   on every push rather than only where someone remembered to look.
3. `docker:check` exits 1 on any ✗, and its build half self-skips *after* the
   static half rather than instead of it.
4. **The rule:** a new check is not done when it passes — it is done when a
   deliberately reintroduced defect makes it fail, and when something runs it
   automatically. Fourteen mutations cover `compose:check` and `docker:check`;
   the web suite has six. Both harnesses live in the audit scratch directory
   rather than the repository (D-029 decision 7), so the mutations are
   documented in `DECISIONS.md` and `CHANGELOG.md` instead of being committed.

**Status:** **Fixed 2026-10-08 for the `lint` instance; the rule now has a
mechanical tripwire.** Two more instances were found while closing this out,
both inside the release verifier, and both are the same shape:

1. **`verify:release` step 2 ran `pnpm -r lint`.** That is not the gate. Every
   package's `lint` script was `echo skip-package-lint`, so the recursive form
   exited 0 having inspected nothing — and the step was wrapped in
   `allowFail: true` inside a `try`/`catch` that printed
   `SKIPPED (no lint configured)`, so it could not fail either way. The
   release verifier reported OK for a lint it never ran. It now runs
   `pnpm lint`, unwrapped.
2. **`verify:release` step 5 ran `pnpm build` with `allowFail: true`.** A
   failed build printed OK and surfaced two steps later as "the api did not
   answer `/health`" — or not at all, when a `dist` from an earlier run was
   still on disk. The `allowFail` is gone.

The five `echo skip-package-lint` stubs are deleted, so `pnpm -r lint` now
fails loudly instead of succeeding silently. Deleting them alone would leave
the pattern available to the next person, so `scripts/lint.ts` gained a fourth
step, `no-noop-script`, which fails on **any** `package.json` script whose body
is a bare `echo`, `true`, `:` or `exit 0` — the rule is about the body, not the
name, because the name is what made `pnpm -r lint` look like the gate. It
carries the same `inspected === 0` guard as the other rules.

**Still open, and it is the general form.** The tripwire catches scripts that
are obviously empty. It cannot catch a script that runs something which
inspects nothing — `pnpm -r test` over a workspace whose `test` script is
`vitest run --passWithNoTests`, or a check whose glob matches no files. For
those the question remains a human one: *what runs this, and what would it take
for it to fail?* Five instances now, and the last two were in the release
verifier itself.

## R-27 — A check that can never pass is indistinguishable from one that found nothing

**Severity:** High
**Likelihood:** Certain — two instances in one session, both found by
auditing real repositories rather than by reading the code
**Status:** Accepted residual — the mitigation is a question, not a check.

**What happens.** R-26 is about a check that never runs. This is its
mirror: the check runs on every audit, and its answer is fixed before it
starts. Both are invisible for the same reason — the instrument is present
and reports something — and this one is worse, because what it reports
reads as a clean bill of health.

**Instance 1 — the screenshot check.** It read:

```ts
hasScreenshots = entries.some((e) => /\.(png|jpe?g|gif|webp|svg)$/i.test(e.path));
```

and `entries` was the output of `filterFiles`, which drops every extension
in `BINARY_EXTENSIONS` — a list containing `.png`, `.jpg`, `.jpeg`, `.gif`
and `.webp`. The question "is there a `.png`" was asked of a list with the
`.png` files already removed. The self-audit reported "no image files in
repo" about a repository with four of them.

The only branch that could ever have succeeded was a `.svg` under 4 KB:
`.svg` is not in the binary list, so it falls through to "unknown
extension, small, treat as text" and survives. A check that passes only on
a rare branch is *harder* to notice than one that never passes at all,
because it produces a yes often enough to look alive.

**Instance 2 — the same predicate, in a test.** `pipeline-fixture.test.ts`
built a thirty-five-line `ScoringInput` by hand, including a copy of the
same `hasScreenshots` line, and never read the result. Fixing the analyzer
did not fix the copy, and the copy would have gone on asserting the old
shape of the bug to anyone who trusted it. Dead code is not inert when it
is a second copy of a rule.

**Why this is High rather than Low.** The failure mode is a *false tick*,
and a false tick is worse than a false alarm. A reader questions an alarm;
nobody questions a green tick. The same class produced `[x] Contracts
covered by tests (Foundry / Hardhat)` on a repository with no contracts
(see R-28) — three green ticks in one report, over capabilities that did
not exist.

**Mitigation.**

1. Existence questions are asked of the whole tree; content questions are
   asked of `fileContents`. `ReportBuilderInput` carries `allPaths` beside
   `entries` for exactly this, and `analyzeDocumentation` /
   `analyzeHackathon` take paths rather than `FileEntry[]` so the wrong
   input is not the convenient one.
2. `documentation.test.ts` runs classify → filter → analyze over the real
   self-audit tree, so the two halves cannot drift apart again: a check
   that asks the filtered list about a binary file fails there.
3. The dead copy in `pipeline-fixture.test.ts` is deleted, and the test
   asserts on the analyzers' own outputs so those calls stay live.

**The rule.** R-26 asked *what runs this, and what would it take for it to
fail?* The question for this class is one step earlier: **what input could
make this check answer "yes", and is that input reachable?** If no reachable
input can produce a yes, the check is not a check. That question is now
the third one in the `mutation-check` skill, alongside the two it already
asked.

**Accepted residual.** Nothing enforces rule 3 mechanically. It is a question a
reviewer has to ask, and the two instances here were both found by running
the tool against real repositories — not by reading it. That is an argument
for keeping the three-repository audit as a repeatable exercise rather than
a one-off.

## R-28 — A green tick over a capability the repository does not have

**Severity:** High
**Likelihood:** Certain — measured on a real self-audit
**Status:** Accepted residual — the test is the three-repository audit, run by
hand. See below.

**What happens.** A checklist row is a claim. When the claim is false in
the *passing* direction, nothing in the report contradicts it: the row is
green, the score is fine, and there is no second signal. An alarm invites
scrutiny; a tick does not. So a false tick survives review, while the same
error in the other direction gets caught within a minute.

**Instance 1 — `[x] Contracts covered by tests (Foundry / Hardhat)`, on a
repository with no contracts.** RepoPilot self-audited as
`Solidity, Foundry`. It is neither. `detectStack` and `analyzeWeb3` were
reading `fixtures/web3-hackathon/`, a fake Solidity project that lives
inside RepoPilot's own test suite, and reporting it as evidence about
RepoPilot. `web3.hasContracts` was therefore true, which emitted the
contract-tests row, and `hasContractTests` was also true, which ticked it.

Two green ticks and a detected stack, all from material that belongs to a
different project.

**Instance 2 — `has-readme: PASS` against `[high] README.md is missing or
empty`.** Here the tick was right and the blocker was wrong, which is the
mirror of the same asymmetry: one fact, two verdicts, and the two entry
points carried their own lists of what a README may be called.
`octocat/Hello-World` has exactly one file, called `README`. The free
check's list accepted it; the audit's did not, so the paid audit led with a
blocker over a file that was present and dropped the documentation score to
5.5.

**Why this is High rather than Low.** Both instances were found only by
auditing real repositories and reading the output closely. Neither is
visible from the code, and both make the product's headline claim —
"grounded in the actual repository contents" — false in the direction that
flatters it.

**Mitigation.**

1. Stack and web3 detection skip stand-in material
   (`fixtures?`, `__fixtures__`, `test-data`, `test-fixtures`) via
   `isSampleMaterialPath` in `utils/paths.ts`. The predicate is
   deliberately narrower than `isFixturePath`: that one includes `test/`,
   and a repository's own `test/Counter.sol` really does mean the project
   is Solidity. `stack.test.ts` pins both directions — the fixture is
   ignored, and `test/Counter.t.sol` is still detected.
2. Both entry points read one set of document-name constants
   (`README_FILENAMES`, `LICENSE_FILENAMES`, `ENV_EXAMPLE_FILENAMES`),
   which are the unions of what the two previously accepted, so unifying
   made neither stricter than it already was.
3. The checklist's evidence now carries counts per (file, rule) rather
   than a list of titles, so the row that says "no committed credentials:
   failed" also says *which file* and *how many* — the information that
   lets a reader check the claim instead of trusting it.

**Accepted residual.** Nothing tests the *whole report* against a repository whose
correct answer is known. The three-repository audit is that test, run by
hand. The self-audit is the hardest case of the three and it is the one
that found all of this; it should be run before every release, and its
score compared against the previous run rather than merely inspected.


## R-29 — The mnemonic rule fires on the dictionary of mnemonics

**Severity:** High
**Likelihood:** Certain — measured on the 2026-10-02 self-audit
**Status:** Fixed 2026-10-02 — the entry says so in its own words ("Fixed —
batch 2, 2026-10-02"). The acceptance criterion it was written against was
restated in the same batch, because the one it named could not be reached.

**What happens.** The `mnemonic` rule has two halves. The candidate test is
a regex for a run of 12–24 lowercase words; the validator,
`isBip39Phrase`, accepts the candidate when *every word is in the BIP-39
list*. The file that defines that list — `packages/core/src/security/
bip39-english.ts` — satisfies both halves on almost every line, by
construction. A wordlist is a list of words that are all in the wordlist.

So the largest single source of "Possible seed phrase" findings in
RepoPilot's own report is RepoPilot's own copy of the BIP-39 wordlist.

**Measured** (self-audit, `mode: full`, 2026-10-02):

| | before `82a244c` | after |
|---|---|---|
| `securityFindings` | 22 | **190** |
| of which in `bip39-english.ts` | 0 | **166** (87%) |
| `securityHygiene` | 40.5 | **0.0** |
| `blockers` | 0 | **25** (the cap) |

185 of the 190 are `SEC-SECRET-001`. The other five are three injection
and two history findings, unchanged.

**This is a regression the fix caused.** The wordlist was added by
`82a244c` to *remove* a false positive — before it, the rule was a bare
"12+ lowercase words", which flagged ordinary prose. Adding the dictionary
made the rule precise for prose and, at the same time, made it fire on the
dictionary. The 2026-10-02 baseline was captured against `b78d334`, nine
commits before that, so nothing in the record shows the change.

**Why this is High rather than Low.** Web3 repositories are the stated
target market, and a vendored BIP-39 wordlist is common in exactly those
repositories — `@scure/bip39`, `bip39`, `ethers` wordlists and hand-copied
`english.txt` files all have this shape. For any such repository the
security dimension reads 0.0 and the blocker list fills with findings that
are all the same non-finding. A security score that is 0 for a reason the
reader can dismiss teaches the reader to dismiss security scores.

**How it was found.** Not by reading the code and not by the test suite:
by the first live run of `scripts/audit-diff.ts`, which compares four real
audits against a recorded baseline. The self-audit's target is this
repository, so the tool noticed that our own commits had moved our own
score. The baseline being stale is what made the 166 visible.

**Fixed — batch 2, 2026-10-02.** Option 2, the file-level predicate, as
`isWordlistFile()` in `packages/core/src/security/shapes.ts`, consulted
through a new `skipFile` gate on the pattern.

**Why option 2 and not option 1.** A path exclusion (`**/bip39-english.ts`)
would have fixed our copy and nothing else. The class is "a file that is a
dictionary of BIP-39 words", and a path does not name that class — a wordlist
fetched into a temporary directory, renamed, or vendored under a different
name all have the shape and none has the path. Option 3 was not needed: the
rule's per-match validator is correct, and the file-level question is the one
it was missing.

**The threshold was measured, not chosen.** Word tokens (`[a-z]{3,12}`, the
same shape the mnemonic candidate regex uses) were counted for every tracked
file with at least 50 of them — 248 files:

| file | BIP-39 fraction | words |
|---|---|---|
| `packages/core/src/security/bip39-english.ts` | **0.956** | 2181 |
| `packages/core/src/findings/rule-registry.ts` | 0.447 | 944 |
| `screenshots/okx-seller-smoke.html` | 0.419 | 186 |
| `packages/core/src/intelligence/limits.ts` | 0.416 | 77 |

Nothing measured lands between 0.447 and 0.956, so the band is wide and the
exact digit does not carry the decision. `WORDLIST_SHARE = 0.75` is the
midpoint. There is also a floor, `WORDLIST_MIN_WORDS = 50`: without it a
twelve-word test fixture made entirely of BIP-39 words scores 1.0 and would
be read as the dictionary.

**Verified.** `scanForSecrets` on this repository's tracked tree, with the
file set held fixed:

| | old scanner | new scanner |
|---|---|---|
| `mnemonic` | 167 | **2** |
| of which in `bip39-english.ts` | 165 | **0** |
| `generic_high_entropy` | 33 | **4** |
| total findings | **210** | **16** |

The two surviving `mnemonic` findings are the deliberate positive fixtures in
`secret-scanner.test.ts:187` and `:195` — the rule's own "does it detect a
phrase" test. Suppressing those would be suppressing the test that proves the
rule works, so a test now pins that a phrase in a document is still reported.

**The tree scan was the easy half.** The first version of this fix left the
history scan broken, and only the audit showed it: `securityFindings` stayed
at 7, one of them `critical` against `bip39-english.ts` in commit `82a244c`,
and the report's headline read "Top blocker: Secret in commit history:
Possible seed phrase". The history scanner scans a patch one added line at a
time, so the file-level question was being asked of a single line — twelve
words, below the floor `isWordlistFile` needs before it will judge a file at
all, so the answer was always no. `scanTextForSecrets` now takes the text a
file-level judgement should be made against, separately from the text being
scanned, and the history scanner passes the whole patch.

**Two lessons, both about where a check is asked.** A file-level predicate
applied to a fragment is not a weaker version of itself, it is a different
question. And **an acceptance tool that reads a published repository can only
measure what has been pushed** — the first re-run of `audit-diff` after the
tree fix measured the *old* code, because the fix was still uncommitted, and
it reported no movement for a change that had already worked.

**The self-audit's floor is now 6, and 5 of them are documents.** After the
fix, `securityFindings` is 6 and `securityHygiene` is 87.5:

| | |
|---|---|
| `low` | `CHANGELOG.md` ×3 (one entropy, one injection, one history) |
| `low` | `DECISIONS.md`, `RISKS.md` — injection patterns |
| `medium` | `shapes.ts:54` **in commit `b01067b`** — the bare citation this batch fixed in the tree |

The last row is the shape of every history finding: **fixing the file does
not fix the commit.** `b01067b` really did add that line, and the record is
correct. It clears itself when the commit falls out of the 20-commit history
window, which is a property of the scan rather than of the finding.

### The acceptance criterion this risk was written against was wrong

`190 → 0`, later `194 → 0`, cannot be reached and was never the right target.

1. **The floor is not zero.** Of the 16 remaining secret findings on the
   tracked tree, **15 are deliberate fixtures** in `secret-scanner.test.ts`
   and `history-scanner.test.ts` — a scanner's test suite has to hold
   realistic-looking keys to prove it detects them — and the 16th is the
   Telegram example at `CHANGELOG.md:2559-2560`
   (`botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"`), where the file
   already records it in its own words as "an inherent residual of the
   unknown-format catch-all, not a miss". This entry used to cite
   `CHANGELOG.md:1177`, which is a line about `docs:facts` and holds no
   Telegram string at all.
2. **`securityFindings` is not the secret scan.** `report/builder.ts:141`
   builds it as `secretFindings + injectionFindings + historyFindings +
   security-category hygiene findings`, then removes anything in a fixture
   path. So a number read out of that field cannot be compared to a
   secret-scan count, and the criterion compared one to the other. Measured
   now: on the tracked tree the secret scan is 210 → 16, while the tree-side
   non-fixture contribution to `securityFindings` is 1 secret finding plus 4
   injection findings — the injection four being our own `CHANGELOG.md`,
   `DECISIONS.md` and `RISKS.md` quoting the instruction phrase the injection
   rule keys on while explaining why it fires on that phrase. That is this
   same risk, one rule over: the rule reporting the sentence that documents
   the rule.

**The criterion, restated: the wordlist contributes zero.** That is what the
change delivers and what a test pins. A literal total is not a criterion for a
field whose scope is four merged sources and whose target is this repository —
every commit we push moves it. See D-032.


## R-30 — `quick` and `full` are the same analysis at two prices

**Severity:** High
**Likelihood:** Certain — measured on the 2026-10-02 baseline
**Status:** **Fixed — 2026-10-03.** The tiers are now separated by what the
report delivers. The price has moved twice since, and both moves are later than
this entry: the 2026-10-03 fix landed on 0.05 for `full`, and D-037 replaced the
whole two-tier table with **one price of 1 USDT for one tier**
(`DEFAULT_PRICING`, `packages/core/src/utils/constants.ts:65-67`). The prices
quoted in the body below are the ones measured when this was found (0.02 / 0.10)
and they are history, not the current table. See the fix at the end.

**What happens — and the tense matters, because this section describes
2026-10-02 and the tree has moved since.** `mode` is a required field on every
audit request, and it decided the price: `priceFor(deps.payment, input.mode)`
resolved to 0.02 USDT for `quick` and 0.10 USDT for `full`. That call no longer
has this shape — `priceFor(cfg)` takes one argument and the table holds one
price — and the numbers below are the ones this was found with. `mode` did not
decide the analysis. Every analyzer ran in both modes, the archive was read the
same way, and `scanHistory()` is still called unconditionally in `pipeline.ts` —
`auditMode` is stamped into `scan.mode` and then read by nothing in the pipeline.

Grepping all of `packages/core/src` for a comparison against `mode` returned
exactly three *at the time*, all in `report/builder.ts`, all after the analysis
is finished. It is not three any more — the fix below added `report/tiers.ts` and
`FULL_ONLY_SECTIONS` — so read the table as the measurement it was, not as the
current shape:

| line | what `mode` changes |
|---|---|
| `builder.ts:365` | adds the `task-add-demo-url` recommended task in `full` only |
| `builder.ts:419` | adds the "Configure reverse proxy + TLS" deployment step in `full` only |
| `builder.ts:554` | adds the limitation sentence in `quick` only |

So `full` buys three extra rows of advice. Everything a customer would use
to decide whether the repository is good — the five dimension scores, the
blocker list, the documentation gaps, the security findings, the detected
stack — is computed identically.

**Measured** (one repository, both modes, `GITHUB_TOKEN` set, 2026-10-02;
these are the two `Hello-World` rows of `scripts/audit-baseline.json`):

| | `octocat/Hello-World` quick | `octocat/Hello-World` full |
|---|---|---|
| `overall` | 53.1 | 53.1 |
| `documentation` | 37.5 | 37.5 |
| `reproducibility` | 28.5 | **28.5** |
| `securityHygiene` | 95.0 | 95.0 |
| `deploymentReadiness` | 63.5 | 63.5 |
| `blockers` / `docGaps` | 4 / 8 | 4 / 8 |
| `secFindings` / `fixtureFindings` | 1 / 0 | 1 / 0 |
| `historyScanned` | yes | yes |

Identical on every axis.

**The `quick` limitation sentence is false.** A `quick` report says:

> Quick scan skips some of the deeper reproducibility heuristics.

Nothing is skipped. `reproducibility` is 28.5 in both modes, and no analyzer
consults the mode. This is the same defect class as R-28 one level down:
R-28 was a green tick over a capability the repository did not have; this is
a stated limitation over an analysis that was never thinned. **No test pins
the sentence** — it occurs in `builder.ts:555` and in generated audit
artefacts, nowhere else — so it can be deleted or made true without breaking
a gate, which is itself the finding.

**The marketplace listing sold the difference.** `MARKETPLACE_LISTING.md`
described the 0.10 USDT tier as including "the deeper reproducibility and
Web3 analyzers", in English and in Chinese. The Web3 analyzer runs in both modes
and there is no deeper reproducibility pass, so a buyer who paid 0.10 received
the same numbers as a buyer who paid 0.02. The listing has since been rewritten
around the single tier: it now reads "One price, one product. There is no
cheaper tier and no deeper tier" (`:47`), and the tier table is
`Free Check — 0 USDT` / `Release Gate — 1 USDT` (`:29`, `:38`, `:102`, `:109`).
The quoted "deeper reproducibility" sentence is gone from the file, which is why
this paragraph quotes it as history instead of pointing at a line.

**A third sighting, already committed.** `screenshots/README.md` labelled the
`full` artefacts "same content here, repo is too small to differ" — the same
theory this entry reached first, written down months earlier and never checked.
It was wrong twice: the two reports are not the same content (`full` carries two
extra advice rows), and the repository being small is not why. That sentence has
since been replaced, and the replacement is worth reading because it is the shape
of a good answer: the row now says the two modes "measure the same thing and
differ only in what they carry", points at the Tiers section of `docs/API.md`,
and explains that the committed artefacts are left as written because they are a
record of what the tool said at the time (`screenshots/README.md:34`). Three
independent places described a difference that did not exist, and all three
survived because no check compares a claim about `mode` against `mode`.

**Why this is High rather than Low.** It is not a scoring bug. It is a
statement to a paying customer that the code does not support, made in the
document that exists to be read by a paying customer. The scores are right;
the *tiering* is fictional. And the direction is the bad one: the cheap tier
over-delivers and the expensive tier is mis-described, so the first person
to notice is a customer comparing notes.

**How it was found.** Not by reading the code and not by the test suite.
While hardening `scripts/audit-diff.ts` (adding the `historyScanned` column),
the four baseline audits were re-run and the two `Hello-World` rows came back
identical on every field. The explanation offered first — "the 3-commit
history adds nothing to a one-file repository" — was wrong, and checking it
is what surfaced that the two modes are the same scan.

**Fixed — 2026-10-03, on the owner's decision.** The decision was neither of
the two options written above in their original form. The tiering is now real,
but it is a *deliverable* boundary rather than an analysis boundary: **`full`
carries a deployment plan and a set of launch copy; `quick` carries neither.**
Everything used to judge the repository — the five dimension scores, the
blocker list, the documentation gaps, the security findings, the detected
stack, the recommended tasks, the launch checklist — is identical in both
tiers, and a test now pins that field by field.

**Why not option 1 as written.** Making `quick` skip analyzers would have made
the score a property of the price. Two buyers auditing the same commit would
get different `overall` values, and neither could tell which one described the
repository. For a launch-readiness gate that is worse than the over-delivery
it fixes: the product's one job is to be the same answer for everyone.
Measured consequence of the chosen design — `scores` is byte-identical across
the two tiers, which `tiers.test.ts` asserts.

**Why not option 2.** The owner wants a ladder, and the deployment plan and
launch copy are genuinely not derivable from the findings, so they cannot leak
through the free derived views (`/fix-plan`, `/diff`, `/quality` all read a
report and never re-scan; see `apps/api/src/routes/audit-derived.ts`). The
ladder is therefore real without reversing that invariant.

**The price is 0.05, not 0.10.** The 5x gap priced the analysis difference the
listing claimed. Once the difference is a deployment plan and a set of launch
copy, the honest multiple is 2.5x. Changed in `DEFAULT_PRICING`, the API
config default, `docker-compose.yml`, `env-check.ts`, `docs/API.md`,
`docs/MCP_CLIENT_SETUP.md`, `README_OKX.md` and the OKX registration
checklist — the registration is an operator action and the live listing still
says 0.10 until it is re-registered.

**How it was implemented.** `packages/core/src/report/tiers.ts` is the single
declaration: `FULL_ONLY_SECTIONS = ['deploymentPlan', 'launchCopy']`. Two
things are derived from it rather than written by hand — the report's new
`omittedSections` field, and the limitation sentence the report uses to
describe itself. Adding a section to the list updates both, which is what the
three scattered `if (mode === 'full')` sites could not do.

`Report.omittedSections` exists because **absent and empty are different
claims.** `deploymentPlan: []` on a quick report does not mean "this
repository has no deployment story"; it means the tier does not include one.
Before this field the two were indistinguishable, and `launchCopy` was already
being represented the bad way — a quick report emitted
`{oneSentencePitch: '', shortDescription: '', xPost: ''}`, three empty strings
standing in for an absence. The field defaults to `[]`, which is the true
answer for a report written before it existed.

`Report.reportVersion` moved to **1.2** as part of this change. The schema
change is additive and a stored 1.1 report still parses, but the *content* of a
quick report changed, and `reportVersion` is in the report cache key precisely
so a build does not serve a report written by an older one. (It is `1.3` today;
R-38 moved it again for its own reason, which that entry records.)

**The test that was missing.** R-30 noted that no test pinned the false
sentence. `tiers.test.ts` now pins four things: the declaration's four
combinations; that both tiers produce identical scores and identical finding
lists; that the report's declared omissions and its actually-empty sections
agree **in both directions** — the reverse direction is what catches a section
quietly emptied without being declared, which is how `launchCopy` was
represented; and that no limitation line matches `/skip|deeper|thinner/i`.

The second direction immediately found something. `builder.test.ts` had a test
named "produces a complete report even with no LLM configured" running as
`quick` with `includeLaunchCopy: true` and asserting the launch copy came out.
It was asserting exactly the behaviour this fix removes — the only test that
touched the tier boundary, and it asserted the wrong side of it.

**One thing this did not fix.** `includeLaunchCopy` remains a request field
whose scope is the `full` tier. It is a refinement, not a second tier knob —
a quick audit omits the launch copy whatever it says — and that scope is now
declared in `tiers.ts` next to the tier that owns it rather than left to be
inferred. It was not removed from the request because it is in the web form,
the MCP tool arguments, the cache key and the integration scripts, and a
breaking request-schema change is a separate decision with its own blast
radius. Recorded rather than folded in.



## R-31 — The typecheck gate does not cover `scripts/`

**Severity:** Medium
**Likelihood:** Certain — measured on 2026-10-02, re-measured 2026-10-08 (56,
then 55, then 56, then 52 — the number tracks how many scripts exist and how
carefully they are written, not progress)

**What happens.** `pnpm lint` step 1 runs `tsc --noEmit` and prints
`Scope: 5 of 6 workspace projects` followed by `✓ tsc clean`. All five
workspace tsconfigs `include` exactly one pattern — `src/**/*` — and no
tsconfig anywhere in the repository includes `scripts/`.

So the first of the six gates says nothing about the directory that holds
`lint.ts` (the gate itself), `docs-facts.ts`, `audit-diff.ts`,
`mcp-audit.ts`, `verify-release.ts`, `compose-check.ts` and the rest. Every
checking mechanism this project has built since the 2026-10-01 review lives
in a directory the typechecker has never been pointed at.

**Measured.** A `tsconfig.scripts.json` extending `tsconfig.base.json` with
`"include": ["scripts/**/*.ts"]` produces **51 errors**:

| count | what |
|---|---|
| 4 | `TS1470` — `import.meta` not allowed, "files which will build into CommonJS output" |
| 1 | `TS2307` — `env-check.ts` cannot resolve `zod` |
| ~30 | `TS18048` / `TS2532` / `TS2345` — possibly-undefined, from `noUncheckedIndexedAccess`, mostly in `lint.ts` (13) and `verify-release.ts` (11) |
| 1 | a real type mismatch in `okx-seller-smoke.ts`: its x402 `accepts[]` literal is missing `resource`, `description` and `mimeType` |

The last row is not a config artefact. It is a genuine disagreement between
the script and the payment schema, sitting in the smoke test that exists to
prove the seller side is wired.

**Part of the cause is a file that is not what it is named.** The root
`tsconfig.json` contains:

```json
{ "name": "@repopilot/root", "version": "0.1.0", "private": true, "type": "module" }
```

That is the root `package.json`'s metadata header, not a tsconfig, and it has
been there since the first commit (`f95ccb5`). Two consequences, both silent:

1. **`"type": "module"` is in the wrong file.** TypeScript never reads it out
   of `tsconfig.json`, and the root `package.json` does not have it — so every
   `scripts/*.ts` is compiled as CommonJS, which is what the four `TS1470`s
   are. At runtime there is no symptom, because `tsx` does not consult the
   field and detects ESM from syntax. The only consumer of the setting is the
   typechecker, and the typechecker never sees these files.
2. **A `tsconfig.json` with no `compilerOptions`** sits at the root, so a bare
   `tsc` in that directory would read it and include every `.ts` file under
   the repository. Nobody runs that, which is why it has never mattered.

**Why this is Medium and not Low.** It is the same defect as D-034, in a
different gate: **the scope of the typecheck is part of the typecheck**, and
its scope silently excludes the code that does the checking. Every script in
that directory was written and reviewed under a green `✓ tsc clean` that was
never about them. It is not High because nothing is *wrong* at runtime —
`tsx` runs them correctly — but the gate is a green tick over an unexamined
directory, which is R-26's shape and R-28's shape.

**How it was found.** While adding the block-scope check in batch 1, the
question "is `scripts/docs-facts.ts` typechecked at all" was asked about a
change to that file. It is not.

**Mitigation, in part.** One of the fifty-six errors was not a config
artefact and is now fixed: the x402 `accepts[]` literal in
`okx-seller-smoke.ts` was missing `resource`, `description` and `mimeType`, and
the file declared the 402 body shape **twice** — once at the call site, once as
`renderMarkdown`'s parameter — so the two copies could and did disagree. It is
one `Audit402Body` interface now. The remaining errors are config and
`noUncheckedIndexedAccess` noise, and they are still a batch of their own: doing
half of it is worse than doing none, because moving `"type": "module"` into
`package.json` fixes ten errors and produces no new coverage, while adding the
tsconfig without moving the field produces ten new failures. The batch is: a
real `tsconfig.scripts.json`, `"type": "module"` moved to where it belongs, the
root `tsconfig.json` replaced with something that is a tsconfig, `zod`
resolvable from the root (or `env-check.ts` excluded with a reason), and the
`noUncheckedIndexedAccess` sites worked through one at a time.

**Re-measured 2026-10-08, and the number moves with the code.** A
`tsconfig.scripts.json` extending `tsconfig.base.json` with
`"include": ["scripts/**/*.ts", "scripts/**/*.mts"]` produced **56** errors, up
from the 51 measured on 2026-10-02 — five batches of new script code, none of it
type-checked. It has since been 55 (fixing the one real error below), 56 again
(this batch added `scripts/test-baseline.ts`, one more `import.meta`), and
**52**, because refactoring `verify-release.ts` into a single `spawnChild`
helper with optional chaining removed four `possibly null` sites. It is 52 now:

| count | what |
|---|---|
| 10 | `TS1470` — one per file, `import.meta` not allowed, "files which will build into CommonJS output". Fixed by `"type": "module"` in the root `package.json`; there are no `.js` files at the root or in `scripts/`, so nothing else changes. |
| 1 | `TS2307` — `env-check.ts` cannot resolve `zod`. It resolves at runtime (`pnpm env:check` runs in `verify:release` step 1), so this is a type-resolution difference, not a missing dependency — but it has to be understood before the gate can be added. |
| 1 | `TS2454` + 3 × `TS2322` in `compose-check.ts` — `parsed` used before being assigned, and `process.exit` used where a `void` callback is expected. Real, and in the compose gate. |
| 2 | `TS18047` — `proc.stdout` / `proc.stderr` possibly null, both in `okx-seller-smoke.ts`. Real. `verify-release.ts` used to contribute four; the `spawnChild` refactor removed them. |
| 30 | The `noUncheckedIndexedAccess` family: 15 × `TS2345` ("argument of type `string \| undefined`"), 11 × `TS18048`, 4 × `TS2532`. Two thirds are in `docs-facts.ts` (23) and `lint.ts` (13), and they are mostly `lines[i]` reads whose bounds the enclosing loop already guarantees. This is the only group where the honest answer might be to narrow the flag for `scripts/` in the new tsconfig, with the reason written down. |

Per file: `docs-facts.ts` 23, `lint.ts` 13, `compose-check.ts` 5,
`okx-seller-smoke.ts` 3, `audit-diff.ts` 2, `env-check.ts` 2, and one each in
`mcp-audit.ts`, `preflight-production.ts`, `test-baseline.ts`,
`verify-release.ts`.

**Status:** **Fixed 2026-10-08.** The count is 0, and the gate covers the
directory: `pnpm lint` step 1 runs two `tsc` passes and prints a tick for each —
`✓ tsc clean (workspaces)` and `✓ tsc clean (scripts/)` — because the scope of a
tick is part of the tick.

It was deferred three times, and the deferral was reasonable each time: it is
*tooling*, the product does not behave differently with the gate on, and the
same weeks bought the payment-path work in R-42 and the gate fixes in R-26 and
R-33. **The trigger was the next real error found in `scripts/` by hand**, and
it fired twice — the `api.kill` type error during R-42 and the
`okx-seller-smoke.ts` mismatch above.

### What the fix was, and the three places this entry was wrong

The recorded plan had the right shape and three wrong details. All three were
written down confidently and none had been checked, which is the failure mode
this file exists to notice.

**1. The `zod` error was not a type-resolution difference.** This entry said
`env-check.ts`'s `import { z } from 'zod'` "resolves at runtime … so this is a
type-resolution difference, not a missing dependency". Both halves are wrong.
`z` is never used anywhere in that file: the import is **dead**, and it never
reached a runtime to be resolved by one. `tsx` transforms with esbuild, which
elides unused imports, so the specifier was dropped before Node saw it. `TS2307`
was a *true* finding about a root `package.json` that does not depend on `zod`,
and the fix is one deleted line. Nothing was added to the root's dependencies.

**2. The config is the root `tsconfig.json`, not a new `tsconfig.scripts.json`.**
The plan named a new file. It was created, the 52 errors were measured through
it, and then it was not kept: `scripts/` is the only TypeScript at the
repository root, and an editor resolves the **nearest** `tsconfig.json`, which
for `scripts/foo.ts` is the root one. A second config under a different name is
the same rules under a name the editor does not look for — the gate would check
one thing and the editor would show another. So the config is the root
`tsconfig.json`, in the place the `package.json` header used to be, and there is
deliberately no second file. `"type": "module"` moved to `package.json`, the
only file TypeScript reads it from; that is the ten `TS1470`s.

**3. The thirty `noUncheckedIndexedAccess` sites were not noise, so the flag was
not narrowed.** This entry offered narrowing it for `scripts/` "with the reason
written down" as possibly the honest answer. Read one at a time, it is not, and
the reason is specific: the two ways to satisfy the flag are not equivalent.
`lines[i] ?? ''` compiles and makes every rule in `lint.ts` silently *skip* the
line — a rule that does not run looking like a rule that passes, which is R-26's
shape. What the sites wanted was `for (const [i, line] of lines.entries())`,
which removes the index instead of papering over it. In `docs-facts.ts` the file
already held the right idiom — `required()`, which throws with "fix the pattern
rather than trusting the result" — and its new sibling `capture()` applies that
rule to a match already in hand, because every capture group read there is
mandatory while TypeScript types all of them as optional. The flag stays on, and
`scripts/` is held to the same standard as `src/`.

Eight of the 42 remaining errors were real rather than config artefacts: four in
`compose-check.ts` (three arrow bodies declared `void` that returned `push`'s
number, and `parsed` used before assignment), the two nullable streams in
`okx-seller-smoke.ts`, `audit-diff.ts`'s `current[label]` read, and the `zod`
import. Two of those were not null-safety at all — `printAndExit` was declared
`: void` while its name promised it exits, and it did fall off its own end when
there was nothing to report, so the signature now says `: never` and the type
checker enforces the trailing `process.exit(0)` that makes the name true.

### The evidence that the gate is real

Three mutations, because a gate change that lands unverified is how R-33
happened, and a tick that cannot fail is the defect R-31 *is*:

| mutation | expected | measured |
|---|---|---|
| one violation of each of the six rules that read a line (`no-console-log`, `no-todo-stubs`, `no-hardcoded-port`, `no-hardcoded-secret`, `no-empty-catch`, `no-floating-promise`) | six reported | six reported, one per line, exit 1 |
| `const mutationProbe: number = 'not a number'` in `scripts/env-check.ts` | the new step fails | five packages `Done`, then `$ tsc -p tsconfig.json` reported `scripts/env-check.ts(24,7): error TS2322`, `✗ tsc failed`, exit 1 |
| `capture()` returning a constant instead of the group | `docs:check` fails | exit 1, `unknown block id "MUTANT"` |

The first is the one that matters for the *refactor*: a green `pnpm lint` after
rewriting six rules proves nothing, because a rule that stopped firing also
reports zero issues.

One more thing the fix made legible: `Scope: 5 of 6 workspace projects` is
**pnpm's own output**, not the repository's. It has been printing above
`✓ tsc clean` all along, and it was the gate announcing that it was skipping a
project. Nothing in the repository read that line as a warning because it did
not come from the repository.

### Residual

- **`fixtures/` is not covered, and should not be.** It holds seven `.ts` files,
  but they sit inside sample repositories that are read as *data* — `path.resolve`
  in `apps/api`'s integration test — and some are deliberately broken: a
  `secret-leak` fixture and a `prompt-injection` one. `lint.ts` already excludes
  them by path (`isFixture`) for that reason. A type checker pointed there would
  be reading a sample, not this program.
- **The gate does not call the root `typecheck` script.** It runs the two
  commands separately so that each tick names its own scope, which means a later
  narrowing of the root script cannot make `✓ tsc clean` a claim about less than
  it appears to cover. `verify:release` step 3 calls `pnpm typecheck`.


## R-32 — The injection rule reports the sentence that documents the injection rule

**Severity:** Low
**Likelihood:** Certain — measured on the 2026-10-03 self-audit
**Status:** Accepted residual. Not being fixed, and the reason is the point.

**What happens.** `RISKS.md`, `DECISIONS.md` and `CHANGELOG.md` each carry a
`low` prompt-injection finding, and all three are the same sentence: our own
explanation that the detector matches on word boundaries, because as a bare
substring the two-word instruction phrase is read out of `contract as`. The
explanation quotes the phrase in order to explain it, and the rule then
reports the quotation.

This is R-29's shape one rule over: **the rule fires on the text that defines
it.** Three sightings of the same pattern now — the mnemonic rule on its own
wordlist, the entropy rule on `shapes.ts`'s own citations, and the injection
rule on the paragraph describing the injection rule.

**Why it is not being fixed.** The finding is a *true positive*. A document
really does contain the phrase the detector looks for, and the detector
cannot tell a quotation from an instruction — nor should it try, because
"the payload is in a code span" is a thing an attacker can arrange. The
severity is already right: the rule only looks in prose documents, and
`severityForPath` holds document findings at `low`.

The available fixes are both worse than the finding:

1. **Reword the documents to avoid the phrase.** This works for `RISKS.md`
   and is arguably better writing — the sentence is about *containment*, so
   naming the containing word is enough and the contained one is redundant.
   It does not work for `DECISIONS.md` or `CHANGELOG.md`, which are records
   of what happened. Editing a decision record so that a check stops firing
   is the failure mode this whole exercise exists to prevent.
2. **Suppress a phrase inside a code span or quotation marks.** That turns a
   true positive into a false negative, in the one rule where the
   attacker chooses the markup.

**What to do instead.** Leave it, and read the number correctly: three of the
self-audit's six `securityFindings` are our own security documentation, at
the lowest severity, and they are the *evidence that the rule works*. A
future reader who wants the number to be zero should fix the rule's scope,
not the sentences.

**Related.** R-29 (the same shape, fixed), R-28 (a tick that means something
other than what it looks like).


## R-33 — The local lint gate checks downstream packages against a stale `dist`

**Severity:** Medium
**Likelihood:** Certain — measured on 2026-10-03

**What happens.** `apps/web` and `apps/api` import `@repopilot/core` through
its `exports` field, which points at `./dist`. So when their `tsc --noEmit`
runs, it reads `packages/core/dist/*.d.ts` **from disk** — not
`packages/core/src`. `scripts/lint.ts` runs `pnpm -r typecheck` as its first
step and never builds. Therefore, whenever core's source changes and its dist
is not rebuilt, the downstream typecheck validates the apps against the
**previous** contract and reports a clean tick.

**Measured.** Adding the required `Report.omittedSections` field to core made
`pnpm lint` print `✓ tsc clean` locally, while CI failed with

```
apps/web typecheck: src/test/fixtures.ts(31,9): error TS2741:
Property 'omittedSections' is missing
```

After running `pnpm --filter "./packages/*" build` first, the *same* local
command failed — and failed in **two** files. The second,
`apps/api/src/tests/api.integration.test.ts`, had been hidden by the same
staleness: fixing only the one CI reported would have produced a second red
run. One stale artefact masked two independent contract violations.

**Why CI and the local gate disagree.** CI builds before linting, and its
comment says why (`.github/workflows/ci.yml:118-129`, the sentence itself at
`:124-125`):

> It has to run before lint, because the root lint also type-checks every package.

The order is load-bearing and documented in one place and enforced in only
that one. Nothing in `scripts/lint.ts` states the same requirement, so the
local gate is the weaker of the two and does not say so.

**Why this is Medium and not Low.** It is D-034 again, in the gate the team
runs most: **the scope of the check is part of the check.** The `✓ tsc clean`
line silently means "the source of five workspaces, plus the last build of
their dependencies", and no reader can tell which build that was.

It is worse than R-31 in one specific way. R-31 is a directory nothing looks
at — a green tick over an unexamined area. This is a green tick that is
**actively wrong about files it does read**, and it fails precisely when a
cross-package contract changes, which is the change most likely to break a
consumer. The gate is at its weakest exactly where it matters most.

**How it was found.** Not by a check. By pushing R-30 and reading a red CI run
that the local gate had already approved. This is the second time a CI-only
failure has been traced to a local gate that was not the gate the reader
thought it was.

**Status:** **Fixed 2026-10-08.** `scripts/lint.ts` step 1 is now "packages +
`tsc --noEmit`" rather than "`tsc --noEmit`": before it type-checks, it
compares each workspace package's newest `src` mtime against its newest `dist`
mtime, and builds the ones whose `dist` is older — in the same step, in the
same process, printing which packages it rebuilt. CI's order (`build` at
`.github/workflows/ci.yml:130-131`, then `lint` at `:139-140`) is unaffected:
when the dists are
current the comparison costs one `stat` per file and prints a tick.

**The build is conditional, and that is deliberate.** A `lint` command that
rewrites `dist` on every run is a `lint` command that surprises people, and an
unconditional build would also have hidden the defect: the gate would have
been *silently* correct instead of *visibly* doing something about a stale
tree.

**How the fix was verified.** Not by reading it. A core public type was
changed without rebuilding, and `pnpm lint` was run in both states:

| state | before the fix | after the fix |
|---|---|---|
| `packages/core/dist` stale, one contract violation | `✓ tsc clean` | `! dist is older than src in packages/core — building before the typecheck` → `✓ rebuilt 1 package(s)` → **the real error, from `apps/api`** |

The fix is also the reason the second violation is no longer hidden: the
typecheck now runs against the source it was written against, so it reports
every consumer that disagrees instead of only the ones whose `dist` happened
to be rebuilt.

**What is still true.** The per-package typecheck — `pnpm -r typecheck`, which is
what CI actually runs (`.github/workflows/ci.yml:142-143`; this entry used to name
the standalone `pnpm typecheck`, which CI never calls) — does not build first,
and neither does a bare
`tsc -p apps/api/tsconfig.json`. Both are still capable of reading a stale
`dist`; the difference is that they are no longer the gate, and the gate is
what a reader trusts. Anyone running them by hand after a change to core's
public types should build first:

```
pnpm --filter "./packages/*" build && pnpm -r typecheck
```

**Related.** R-31 (a gate whose scope is narrower than it looks), D-034 (the
scope of a check is part of the check), R-26 (a check that never runs).

## R-34 — The MCP server cannot be installed outside its own checkout

**Severity:** Medium
**Likelihood:** Certain — measured on 2026-10-04
**Status:** Fixed 2026-10-04 for the tarball and the documentation. Whether to
publish — three packages under one scope, or the two workspace packages bundled
into this one's `dist` — is a distribution decision rather than a defect, and
the entry leaves it deliberately open. So "the MCP server cannot be installed
from npm" is a known state, not an outstanding fix.

**What happens.** `packages/mcp-server/package.json` advertises a binary
(`repopilot-mcp`) and is `private: true`, and two of its dependencies are
declared as `workspace:*`. So there are exactly two ways to obtain it, and
one of them lies:

- `npm i -g ./packages/mcp-server` — **reports success and does not
  install anything**. npm links a local directory instead of copying it, so
  `lib/node_modules/@repopilot/mcp-server` is a symlink back into this
  checkout and every import resolves through the checkout's own
  `node_modules`. It exits 0 and prints `added 1 package in 4s`.
- `npm pack` then install that tarball — **fails**, because npm rejects the
  protocol outside a workspace: `EUNSUPPORTEDPROTOCOL: Unsupported URL Type
  "workspace:": workspace:*`.

**Measured.** `registry.npmjs.org/@repopilot%2Fmcp-server` answers 404. A
root `workspaces` field is not a fix: a throwaway workspace with one proved
npm leaves `workspace:*` untouched on `pack`, and pnpm prints
`The "workspaces" field in package.json is not supported by pnpm` for the
same field. The tarball also carried **114 files** — `src/`, `tsconfig.json`
and 76 `vitest.config.ts.timestamp-*.mjs` scratch files — because no package
declared `files`. That part is now fixed: `files: ["dist", "!dist/**/*.test.*"]`
takes it to 21 files, 29.2 kB.

**Why this is Medium and not Low.** The failure is **silent**. Both the
installer's exit code and its output say the install worked, and the
`repopilot-mcp` command it produces really does run — on this machine, for
as long as the checkout stays put. A reader has no signal that they have
taken a dependency on a directory rather than installed a package, and the
first symptom is a broken command on someone else's machine.

**How it was found.** By running the generated shim rather than reading the
manifest. The manifest was read too, but reading it is what produced the
*false* conclusion "private, so it cannot be published, but a global
install of the local path is fine".

**Mitigation.** The tarball is clean (`files` on all three library
packages). `docs/MCP_CLIENT_SETUP.md` now states that the package is not on
npm, that `npm i -g` links rather than installs, and what publishing would
require. Whether to publish — and therefore whether to ship the three
packages together under a scope or bundle the two workspace packages into
this one's `dist` — is a distribution decision, not a defect, and is
deliberately left open.


## R-35 — A test that re-implements the code under test asserts nothing about it

**Severity:** Medium
**Likelihood:** Certain — measured on 2026-10-04
**Status:** Fixed 2026-10-04 for `free-check.test.ts`, and 2026-10-16 for the
`AuditPipeline` orchestration (both below). The class is not swept: a test that
rebuilds the logic it means to check, or a module with no seam to test it
through, is invisible to every existing gate and nothing in CI looks for it,
which the entry records as its residual.

**What happens.** `free-check.test.ts` opened with a `describe('FreeCheck
heuristics')` block whose cases built their own `README_NAMES` set, their own
`LICENSE_NAMES` and `ENV_EXAMPLE_NAMES` sets, their own `LOCKFILE_PATTERNS`
array, their own CI regexes, and their own `entries.find(...)` — inside the
test body — and then asserted on those. Every assertion was about code
written in the test file. The module they were named after was not involved.

The file did contain two cases that reached the real `FreeCheckRunner`, and
they are the reason the block looked like coverage: `rejects a non-https URL`
and `rejects an off-allowlist host`. Both are answered by `parseRepoUrl`,
which runs before the runner touches anything, so they exercised the URL
parser and nothing else. Five green tests, four of them about a copy.

**Measured.** With `LOCKFILE_PATTERNS` emptied in `packages/core/src/
free-check.ts`, the old file passed **5 of 5** — the same 5 it passed before.
The rules that decide whether a repository has a lockfile could have been
deleted outright and the suite would have said the entry point was fine.

**Why it mattered here more than elsewhere.** This was not an obscure module.
It is `POST /api/v1/free-check` — the no-payment tier the marketplace listing
describes as *"the entry point other AI agents use to decide whether a repo is
worth gating"* (`MARKETPLACE_LISTING.md:34-35`; this entry used to quote a
paraphrase as if it were the sentence). It is the first thing a prospective
buyer runs, it is the cheapest thing to break, and it was the least verified
part of the product. A funnel entry that reports `has-readme: FAIL` on a
repository that has a README costs a sale before the paid tier is ever reached.

**How it was found.** Not by a check, and not by reading the test file —
reading it produces the impression of a well-covered module, because the
constants being rebuilt look like fixtures. It was found by trying to *use*
the runner from a second caller: adding `free_check` to the MCP server needed
a way to drive the runner without the network, and there was none. The
runner built `GitHubFetcher` and `MetadataAnalyzer` inline, so no test could
substitute them. The absent seam is what led back to the tests that had been
written to route around it.

**The rule.** A test asserts something about the product only if it reaches
product code. Re-declaring a constant inside a test body converts a real
assertion into a tautology, and the failure is invisible in review because the
test reads as thorough — it names the right things and covers the right
cases, just against the wrong code. The question to ask of any test is the
one R-26 asks of any check: **what would have to change in the product for
this to go red?** If the answer is "nothing in the product", it is not a test.

**Mitigation.** `FreeCheckRunner` takes a `source` (`FreeCheckSource`:
`metadata` + `tree`), defaulted to the real GitHub source, and
`free-check.test.ts` drives the shipped runner through it — 26 cases over the
five checks, the score arithmetic, the evidence strings, the branch-resolution
order, the metadata-failure fallback and the stack detection. Each new
assertion was mutation-tested before landing: emptying `LOCKFILE_PATTERNS`
fails 8 cases, reading a fixed `main` instead of the branch the metadata
reports fails 1, returning the first match instead of the shortest path fails
1. That last mutation **survived the first version of the test** — the fixture
listed `README.md` before `docs/README.md`, so first-match and shortest-match
gave the same answer and the case was green for a reason it did not state.
The fixture order was changed until the mutation died, which is the only
evidence that a case discriminates between the two rules.

**Residual risk.** Three modules were re-examined, not the codebase. The same
shape — a test that rebuilds the logic it means to check, or a collaborator
built inline so no test can substitute it — is invisible to every existing
gate, and nothing in CI looks for it. `pnpm -r test` counts cases, not
whether they can fail.

**A second instance, found 2026-10-09.** `packages/core/src/quality/contract.test.ts:334-356` builds
the two secret findings it is about with hand-written ids
(`'secret-aws_access_key-1-src-config-ts'`) rather than by running
`scanForSecrets` → `toSecretFindings`, and its helper says in a docstring that
they are "as the scanner actually emits them" — a claim about fidelity that
nothing checks, exactly like the `README_NAMES` copies above. It is a weaker
instance than the first: `enrichFinding` and `ruleFor` are real, the two ids are
correct today, and the assertions are about `collectFindings`, which is real. But
if `toSecretFindings` changed its id format the tests would keep passing, and
that is the property this entry is about. Recorded rather than fixed, because
this entry's own lesson is that the fix is a rewrite of the helper plus a
mutation to prove the new version can fail — not a substitution of one call.

**A third instance, found and fixed 2026-10-16.** The same missing seam as the
first instance, in the same package, with the opposite outcome. `AuditPipeline`
built `MetadataAnalyzer` and `GitHubFetcher` inline inside `run()`, exactly as
`FreeCheckRunner` did, so `run()` had **no test at all** — not a tautological
one, none. Nothing in `packages/core/src` mocked the network, and the only
route to the pipeline's orchestration was a real audit against a real
repository.

The gap was real rather than theoretical because it sat on a fixed bug.
`scanHistory` used to catch its failure *outside* the commit loop, so a rate
limit on the sixth of twenty commits threw away the five already read: the
report said `scannedCommits: 0` and a note that history could not be read,
while five commits had been fetched, scanned and found clean. That was fixed
by moving the `try` inside the loop and keeping what was read — four lines,
and with no test on the loop, nothing would have noticed if it came back.

**The seam was the same one, so the fix is the same one.** `PipelineOptions`
gained `fetcher` and `metadataAnalyzer`, structurally typed
(`PipelineFetcher`, `PipelineMetadata`) and defaulted to the real
implementations — the `FreeCheckSource` pattern, applied to the pipeline.
Nothing in `run()` does I/O itself; it calls four methods on the fetcher and
one on the metadata analyzer, so a fake makes the whole path offline.
`packages/core/src/pipeline.test.ts` drives it: the mid-loop failure keeps the
two commits it read *and* the secret they contained, the loop stops rather
than continuing past the failure, an unreadable history reports zero rather
than throwing, completeness is claimed only when the scan reached the
beginning of history, a disabled scan costs zero requests, and the
`contentSkipped` and `degraded` values reach `limitations`. Mutation-tested
the same way as the free-check cases: restoring the pre-fix shape — the
`try` back outside the loop — fails exactly the first case and leaves the
other seven green, which is the evidence that the case discriminates between
the fixed and unfixed loop rather than merely exercising it.

**Related.** R-26 (a check that never runs is indistinguishable from one that
passes), R-27 (a check that can never pass), D-034 (the scope of a check is
part of the check).

---

## R-36 — A document cannot disagree with a function it is never compared to

**Severity:** High **Likelihood:** High (it had already happened)
**Status:** Fixed 2026-10-05 for §5.5 and for the price. Whether `asset` belongs
in `accepts[]` is **not confirmed** — the snapshot's own field list omits it and
the adapter emits it — and the test pins the document and the adapter together
until someone decides, which is the entry's stated residual.

**The defect.** `docs/OKX_REQUIREMENTS_SNAPSHOT.md` §5.5 is the registration
authority: it is the 402 challenge the ASP is registered with, and the shape a
marketplace reviewer compares the live service against. It had drifted from
`OkxPaymentAdapter.createChallenge` in four independent ways:

| Field | §5.5 said | The adapter emitted |
| --- | --- | --- |
| `resource` | `https://<public-domain>/api/v1/audits` | `https://repopilot/api/v1/audits` — hard-coded, and not a host that exists |
| `description` | `RepoPilot Quick Audit` | `RepoPilot quick audit` — the internal `mode` value, lower-cased |
| `maxTimeoutSeconds` | `60` | `300`, matching the challenge's own 5-minute `expiresAt` |
| `asset` | absent | present — the USDT contract address |

**Why it matters more than a stale table.** Three of the four are read by the
buyer. `resource` is the field an x402 client shows as *the thing being paid
for*; `description` is the tier name on the payment prompt, and it named the
tier differently from the listing that sold it; `maxTimeoutSeconds` is the
window the buyer's wallet is told it has to sign in. The `resource` value was
the worst of the four because it looked plausible — `https://repopilot/…` is a
syntactically valid https URL with no TLD, so nothing rejects it and nobody
reads it twice.

**How it was found.** Not by a check. It was found by writing one. The same
week, the same question asked of the *price* had already found a worse instance
of the same defect: `PRICE_FULL_AUDIT` was stated as `0.10` in `.env.example`
and `0.05` in every other place that stated it, and
`docs/EXTERNAL_ACTIONS.md` told the operator to set the price from
`.env.example` — so the runbook pointed at the one wrong copy. In `okx` mode
the 402 amount comes from that variable, so a buyer reading `0.05` on the
listing would sign an EIP-3009 authorization for `0.05` and be challenged for
`0.10`: the first real sale fails at the payment step. That one now has a
check that compares every statement of the price (`readPriceStatements()` in
`scripts/docs-facts.ts`) — twelve of them while there were two tiers, six now
that there is one (D-037). The 402 shape was the
next question, and its answer was "nothing compares them".

**The rule.** For any payload an external party reads — a price, a challenge, a
listing — the document and the producer must be *compared*, not both maintained.
A second hand-written copy of a machine-generated value is a copy that can only
be wrong.

**Mitigation.** `okx-adapter.test.ts` reads §5.5 out of the snapshot, extracts
the `accepts[0]` object, and asserts the field set and every
environment-independent value against the challenge the adapter actually
builds. Injections were run against it and all are caught: changing
`maxTimeoutSeconds` to `60`, rewording the `description`, deleting `asset`,
renaming `mimeType`, and changing `maxAmountRequired`. Two
code-side injections (hard-coding the `description`, hard-coding the network)
are caught as well, so the check is not one-directional. D-037 removed the
second service, so the two injections that targeted a `full`-tier description
no longer exist — there is one description, and the test asserts it for both
modes.

`resource` became `OKX_PAYMENT_RESOURCE_URL`, and the unconfigured value became
`https://repopilot.invalid/api/v1/audits`. `.invalid` is reserved by RFC 2606 and
can never resolve, so "this is a placeholder" is a property of the string rather
than something a reader has to know. `validateProductionConfig` refuses to boot
in production with `PAYMENT_MODE=okx` and no resource URL, so the placeholder
cannot reach a buyer.

**Residual risk.** Whether `asset` belongs in `accepts[]` is **not confirmed**.
§1.4's field list omits it and the adapter emits it; the `exact` scheme needs the
token contract, so either the snapshot's list is incomplete or the field is
extra. `validate-listing` is the only thing that can settle it and it needs a
registered ASP. Until then the test pins the two together, which means the
question cannot be answered by accident — someone has to decide and change both.

**Related.** R-26 (a check that never runs), R-27 (a check that can never pass),
R-28 (a green tick over a capability the repository does not have), D-033 (a
document states no fact it can derive), D-034 (the scope of a check is part of
the check).

---

## R-37 — The paid service is sold as `mode=full` and the server defaulted to `quick`

**Severity:** Medium **Likelihood:** Medium
**Status:** **Fixed 2026-10-05.** The default is `full`; `quick` is an explicit
opt-out. Pinned by `packages/core/src/schemas/inputs.test.ts`.

**The defect.** With one price (D-037), the registration copy names `mode=full`
because the service description promises the deployment plan and the launch
copy. `CreateAuditInputSchema` in `packages/core/src/schemas/inputs.ts` defaulted
`mode` to `quick`, which omits both. The promise therefore held only if the
caller read the description and sent the field; a caller that omitted it paid
the same 1 USDT and received less.

**Why it was deferred rather than fixed with the price change.** Defaulting to
`full` is one line, but it silently changes the report every existing caller
gets — including `apps/web`'s form default and both MCP tools' declared default
— and a behaviour change of that shape deserved its own decision rather than
riding along with a price change. D-037 declined to smuggle it in; the decision
was taken separately on 2026-10-05.

**Why it was recorded rather than left implicit.** It has the same shape as
R-36: a promise on one side and a producer on the other, with nothing comparing
them. The difference is that these two *can* be reconciled by a sentence,
because the caller is an AI agent reading the description rather than a buyer
reading a listing.

**What the fix touched.** Four declarations of the default, and nothing else:
`CreateAuditInputSchema`, the two MCP tool schemas (`audit_github_repository`,
`reaudit_repository`), and `apps/web`'s form state. §5.4 of
`docs/OKX_REQUIREMENTS_SNAPSHOT.md`, `docs/API.md`'s request table and `README`
now state `full` as the default.

**A fifth call site, missed for four days — found 2026-10-09.** The fix counted
declarations of the default and there was a fifth that is not one: the reaudit
route built its input by hand, `mode: body['mode'] ?? 'quick'`
(`apps/api/src/routes/audits.ts:130`), with every *other* field in that object
mirroring the schema's default. So the same re-audit reached over HTTP asked for
`quick` and over MCP asked for `full`, and the HTTP one was the cheaper — the
paid tier not delivering what the listing sells, which is the sentence this entry
exists because of. `docs/API.md` documented the route correctly
(`Defaults: mode: "quick"`), which is why nothing flagged it: the document agreed
with the code, and both disagreed with the contract. Fixed to `full`, and the
document with it. The lesson is the entry's own: "four declarations" was a count
of the places the default is *written down*, and the bug was in the place it is
computed.

**The check, and why it is not optional.** Nothing else in the suite read the
default, so reverting the line would have been silent — which is the whole
failure mode. `inputs.test.ts` asserts the default is `full` and that an
explicit `quick` still parses. A one-line change that nothing observes is a
one-line change that comes back.

**Related.** R-36 (a document cannot disagree with a function it is never
compared to), D-035 (a tier changes what a report carries), D-037 (one price,
one product).

---

## R-38 — The LLM provider was wired from config and never read

**Severity:** Low **Likelihood:** Confirmed
**Status:** Fixed 2026-10-06 — the provider, the prompt builder and every call
site are deleted, so there is nothing left to wire, and `REPORT_VERSION` moved
1.2 → 1.3 because a key consumers read left the map. The upgrade path is in the
entry and in the git history.

**The defect.** `apps/api/src/server.ts` built a provider from `LLM_PROVIDER`
/ `LLM_API_KEY` / `LLM_MODEL` (`defaultLlmProvider()`) and passed it into
`buildApp` as `AppDeps.llmProvider` at both call sites. Nothing read it.
Measured 2026-10-05: searching the whole repository for the identifier outside
the declaration and those two call sites returned no hits, and the only
LLM-shaped values that reached the pipeline were the literals
`llmProviderName` / `llmProviderConfigured` written in three places —
`audit-worker.ts`, `job-service.ts` and the MCP server, which disagreed with
each other (`'noop'` in two, `'none'` in the third). `PipelineInput` carried
those two strings and no provider object, so the pipeline had no way to call
one.

**Why it matters.** The failure mode is an operator spending money and
believing it worked. `docs/EXTERNAL_ACTIONS.md` §8 told them to set four env
vars, restart, and expect "a noticeably richer `summary` and `launchCopy`" on
the first gate. None of that happened: `ReportBuilder.build()` fills both
fields from `templateSummary()` / `templateLaunchCopy()`. It was worse than a
no-op — `scripts/env-check.ts` *errored* when `LLM_PROVIDER=openai-compatible`
and the key, base URL or model was missing, so `preflight:production` refused
to pass without a credential for a capability that did nothing.

**What the fix touched.** The whole surface, deleted rather than annotated:

- `packages/core/src/llm/` — `provider.ts`, `noop-provider.ts`,
  `openai-compatible-provider.ts`, `prompts.ts`, and the `./llm` subpath export
  in `packages/core/package.json`. `templates.ts` moved to
  `packages/core/src/report/templates.ts`, which is what it always was: the
  report builder's deterministic copy.
- `polishFixPlanSet()`, `PolishOptions` and the `llmEnhanced` field. The
  function had one caller — its own `describe` block — and the field's only
  possible value was `false`, so `docs/API.md` documented a boolean that could
  never be true.
- `ReportBuilderInput.llm`, which the builder never read. Its presence is what
  made `provider.ts`'s header ("the report builder falls back to deterministic
  templates") false.
- `defaultLlmProvider()`, `AppDeps.llmProvider`, the four `LLM_*` config
  variables, their `.env.example` block, and the three blocks in
  `scripts/env-check.ts`.
- `PipelineInput.llmProviderName` / `llmProviderConfigured` and the three
  literal producers.
- `'analyzers.llm': 'optional; disabled by default'` from
  `buildProvenance()`, which put a claim about a component into a map whose
  every other key names an analyzer that runs, in every report every buyer
  receives. A key left a map consumers read, so `REPORT_VERSION` moved
  1.2 → 1.3; 1.2 reports still parse (`SUPPORTED_REPORT_VERSIONS`).

**Why deleted rather than wired.** Wiring it changes the content of every
report, the `analyzerProvenance` a buyer can read, the cache key, and the cost
of every gate — while the product is sold at one USDT with "no LLM in the
scoring" as part of its pitch. That is a product decision, and the answer this
repository already gave was "no LLM": the report has never contained one. What
was left was a documented *option* to add one that could not be exercised,
`@repopilot/core` is `private: true` and not independently installable, so
there was no library consumer to justify keeping it either. The upgrade path is
below and in the git history.

**The check.** Two, and both were verified by mutation rather than assumed:

- `packages/core/src/schemas/report-version.test.ts` writes 1.3, parses 1.3,
  still parses 1.2 and 1.1, and refuses a version it does not know.
- `packages/core/src/fixplan/builder.test.ts` lost four cases with the function
  they tested. That is the honest outcome: they were the reason
  `polishFixPlanSet()` looked alive.

`scripts/env-check.ts` keeps `LLM_API_KEY` in `KNOWN_SECRET_KEYS` even though
it is no longer a RepoPilot variable. That list is redaction, not
configuration: an operator who set the key months ago still has it in their
shell, and removing the entry would print it.

**Upgrade path.** Thread a provider into `PipelineInput`, call it for
`'summary'` and `'launch_copy'` in the builder, record the provider name in
`analyzerProvenance` from the actual provider rather than from a literal, and
add a test that a configured provider changes the report and a failing one
falls back to the template. Do it as a product change with a `REPORT_VERSION`
bump, not as an env var.

**Related.** R-26 (a check that never runs), R-28 (a green tick over a
capability the repository does not have), R-31 (a gate that does not cover
what it claims), R-35 (a test that re-implements the code under test asserts
nothing about it — `polishFixPlanSet`'s four cases were the closest thing this
repository had to a green light on the LLM surface), and D-009.

---

## R-39 — The OKX paid endpoint answered 400 to every buyer before verifying anything

**Severity:** Critical **Likelihood:** Confirmed
**Status:** Fixed 2026-10-06 — one parser, and the route's own is gone, with a
test that runs the paid route in `PAYMENT_MODE=okx` and asserts `402` rather
than `400`. The expiry gap this entry deliberately left open was judged wrong in
the same week and fixed in R-40, which is the entry's own correction.

**The defect.** `apps/api/src/routes/audits.ts` carried its own parser for the
`X-PAYMENT` header (`extractPaymentId`) and looked for `paymentId` at the **top
level** of the envelope. `packages/okx-adapter/src/okx-adapter.ts` carried a
second parser (`parsePaymentHeader`) whose declared shape
(`ParsedPaymentHeader`) puts it at **`payload.paymentId`**. The route ran first,
found nothing, and answered

```
400 { "error": { "code": "INVALID_INPUT", "message": "X-PAYMENT header is malformed" } }
```

before `verifyPayment` was ever called. In `PAYMENT_MODE=okx` the paid endpoint
could not accept a payment from any buyer following the documented flow.

**Measured, not inferred.** `extractPaymentId` copied verbatim out of the route
and run against an envelope in the adapter's declared shape:

```
envelope paymentId is at payload.paymentId = okx_11111111-2222-3333-4444-555555555555
extractPaymentId(adapterShaped, "okx") = null
extractPaymentId(topLevelShaped,  "okx") = "okx_11111111-2222-3333-4444-555555555555"
```

`null` is the 400. The signature is irrelevant to this defect — it never got
that far — which is why the check above needs no signing key.

**Why no test caught it.** Every payment test in the repository runs in
`PAYMENT_MODE=mock`, where the header is the plain string `mock:<paymentId>` and
both parsers agree because there is nothing to parse. `okx-adapter.test.ts`
called `verifyPayment` only with `null` and with `'not-base64-!!'` — no test ever
built an envelope, so the success path a paying buyer takes had **zero**
coverage. The 402-challenge shape was well covered (pinned against
`docs/OKX_REQUIREMENTS_SNAPSHOT.md` §5.5); the step after it was not covered at
all. Coverage of the first half of a handshake is what made the second half look
tested.

**Why it matters.** This is the only rail that takes real money, and it was
unshippable. The mock rail is what CI exercises and what `README.md`'s quickstart
uses, so nothing in the repository's own loop could have surfaced it.

**Root cause, and why the fix is where it is.** The `X-PAYMENT` envelope is this
adapter's wire format, and the route held a **second copy of that knowledge**.
The copy is gone: `PaymentAdapter.readPaymentId(rawHeader)` is now the single
owner, the route calls it, and `extractPaymentId` is deleted. `verifyPayment`
takes the id as an argument, so before this the route had to parse the header to
produce it — two readers of one format, in two packages, with nothing comparing
them. R-36 is the same shape one level up (a document and a function, never
compared); this is two functions.

**The part that is still unknown, stated rather than papered over.** Where
`paymentId` sits in the real `onchainos` envelope is **not documented anywhere
in this repository**: `docs/OKX_REQUIREMENTS_SNAPSHOT.md` §1.4 says only "the
base64-encoded receipt" and `README_OKX.md` says only "a base64-encoded JSON
envelope". The two in-repo parsers disagreed and neither had evidence behind it.
So `readPaymentId` reads **both** placements, `okx-adapter.test.ts` pins both,
and the comment there says which line to delete once the real envelope is
observed. Accepting both is not speculative flexibility — it is the honest
response to a format with no in-repo authority, and it is confined to the one
component that owns the format.

**Also deleted in the same pass** (same class — declared, never true):

- `OkxPaymentAdapterOptions.rpcUrl`. Nothing constructed it with a value and
  nothing read it; its comment claimed it was "used to read the on-chain
  `authorizationUsed` flag". `docs/OKX_LIVE_INTEGRATION.md` §2.1 describes that
  RPC URL as an *optional seller-side* input and `ROADMAP.md` lists the on-chain
  check as still-to-do, so the code and two of its documents agreed that it was
  never implemented — and `okx-adapter.ts`'s own header plus
  `docs/ARCHITECTURE.md` both said it was. The two that were wrong are fixed.
- `PaymentReceipt.txHash` / `.blockNumber`. Written by both adapters, read by
  nothing, and untrue in both: on the OKX path they were **unverified values the
  buyer put in the envelope**, echoed back in the same field shape as an
  observation; on the mock path `blockNumber` was `Math.floor(Date.now()/1000)`
  — a Unix timestamp in a field named after a block. They surfaced only in an
  undocumented `payment` object on the 402 body.
- `PaymentReceipt.status`'s `'settling'` and `'cancelled'`. No adapter produced
  either. `'settling'` named a step this service does not perform.
- `PaymentAdapter.getReceipt()`. Two implementations, zero callers.
- `verifyEip3009`'s `network` parameter. Passed at the one call site,
  never destructured.
- `docs/ARCHITECTURE.md`'s interface list named `refund` and `getReceipt`;
  `refund` **never existed in any adapter**.
- `docs/OKX_REQUIREMENTS_SNAPSHOT.md` §1.4 and §2 described `OKXAdapter` as
  *raising* `STUB BOUNDARY: …`, in two different wordings. **Neither string
  exists anywhere in the codebase**; `createChallenge` and `verifyPayment` are
  fully implemented and neither throws.
- `docs/OKX_LIVE_INTEGRATION.md` §2.2 said `OKX_AGENT_KEY` /
  `OKX_AGENT_SECRET` "appear only in a JSDoc comment in
  `packages/okx-adapter/src/okx-adapter.ts:46`" and proposed deleting it. **No
  such comment exists in any revision of that file** (checked with
  `git show HEAD:…`). They appear only in `scripts/env-check.ts`'s
  `KNOWN_SECRET_KEYS`, whose job is redaction, not configuration.
- `README_OKX.md` §5 step 5 said the success response body "is the full `Report`
  JSON". The endpoint answers `202` with `statusUrl` / `pollAfterMs`.
- `scripts/env-check.ts` range-checked `ANALYSIS_TIMEOUT_MS`, a variable no
  module reads and that `.env.example` does not list. It gave operators a green
  tick over a setting the service ignores.

**What now pins it.** `apps/api/src/tests/okx-payment.test.ts` — the first test
in the repository to run the paid route in `PAYMENT_MODE=okx` at all. A
well-formed envelope must answer `402 PAYMENT_NOT_SETTLED` (the envelope was
parsed and the signature rejected) and specifically **not** `400`; a malformed
one must still answer `400`, because "unreadable" and "unverified" are different
answers. It needs no signing key, because the defect was upstream of the
signature. `okx-adapter.test.ts` covers the other half with real signatures:
`privateKeyToAccount().signTypedData()` against the xlayer USDT domain, asserting
`completed` for a correct authorization and `failed` for a wrong amount and for
a wrong payee. `mock-adapter.test.ts` covers the mock half of `readPaymentId`.

**Recorded, not fixed here — the expiry gap.** `verifyEip3009` checks `to`,
`value` and the signature. It does **not** compare the signed `validAfter` /
`validBefore` against the clock, so an authorization that has already expired
still verifies and still yields `completed`. Left open in this batch on purpose:
what the service should *do* with an expired-but-valid authorization looked like
a product question, because nothing settles an authorization here. **That
judgement was wrong, and it is corrected in R-40** — the answer does not depend
on settlement at all. Accepting an expired authorization hands over an audit that
can never be collected, whatever the seller does later, so the window is a
correctness check and not a policy choice. Fixed in R-40, together with the
larger hole it was hiding behind.

**Related.** R-36 (a document and a function, never compared — this is the same
defect with two functions), R-38 (a declared capability with no consumer, the
same class as `rpcUrl` / `txHash` / `'settling'` / `getReceipt`), R-28 (a green
tick over a capability the repository does not have — `env-check.ts` range-
checking `ANALYSIS_TIMEOUT_MS` is exactly that), R-35 (a test that asserts
nothing about the code under test — `verifyPayment`'s success path had no test at
all, which is the limiting case), and R-40 (the same signed message verified
against every future challenge, because the two checks that make one
authorization worth one payment were both missing).

---

## R-40 — One signed authorization bought unlimited audits

**Severity:** Critical
**Likelihood:** Certain for anyone who tries (the buyer composes the header)
**Status:** Fixed 2026-10-06 (R-40), durability gap closed the same day (R-42)

**What it was.** `OkxPaymentAdapter.verifyPayment` verified the buyer's EIP-3009
authorization and returned `completed` — but the EIP-712 message it verifies is
`(from, to, value, validAfter, validBefore, nonce)`, which **does not contain the
`paymentId`**. The `paymentId` is chosen by this service and arrives in the same
JSON envelope as a plain field, so a buyer can take a signature they already hold
and point it at a different challenge by rewriting one string.

Every POST mints a fresh `paymentId` (D-011), so there is always a new challenge
to point at. The two checks that would each have stopped this were both missing:

- the signed `nonce` was never recorded, so it was not single-use;
- the signed `validAfter` / `validBefore` window was never compared to a clock,
  so an authorization that expired last year verified as paid.

**Measured, not inferred.** Four new tests were run against the pre-fix source
before the fix was written; four failed:

```
FAIL  OkxPaymentAdapter > verify never throws on an envelope that parses but is not an authorization
FAIL  one signed authorization buys one audit > refuses a signature that has already bought an audit
FAIL  one signed authorization buys one audit > refuses an authorization whose window has already closed
FAIL  one signed authorization buys one audit > refuses an authorization that is not valid yet
      Tests  4 failed | 23 passed (27)
```

The replay case is the one that matters: `createChallenge` → sign → `completed`,
then a **second** `createChallenge` and the **same signature** with only
`payload.paymentId` rewritten → `completed` again. The helper that does the
rewrite is three lines in the test file, because the header is base64 of plain
JSON.

**Why it matters.** This is the paid gate. It is the only thing between a buyer
and a 1 USDT audit, and it was handing out the audit for one signature. The
previous batch (R-39) made this rail *reachable*; this one makes it *paid*. R-39
could not have found it: a defect that only shows up on the **second** use of a
credential needs a test that uses it twice, and the first test that ever ran this
route ran it once.

**Why it is not "an on-chain problem".** This adapter deliberately does not read
the chain (see the boundary at the top of `okx-adapter.ts`), so it cannot consult
EIP-3009's `authorizationUsed[from][nonce]` mapping. That read is precisely what
makes one authorization worth one transfer on chain, and **this adapter is
standing in for it** — so it has to perform the equivalent check itself rather
than assume a layer that is not there. The whole class is the same as R-38's: a
capability that is *declared* (the code says the authorization is verified) with
no consumer of the invariant it implies.

**The fix, and why it is in the adapter.**

- `spentNonces: Set<string>`, keyed `` `${from}:${nonce}` `` — the same key the
  on-chain mapping uses. Burned **after** the signature verifies, so a caller
  cannot consume a nonce it cannot sign for.
- `verifyEip3009` now also checks `validAfter <= now < validBefore`
  (`validBefore` exclusive, matching EIP-3009's `block.timestamp < validBefore`)
  and returns the nonce key instead of a boolean — one parse, and a caller
  cannot forget which nonce it just accepted.
- `verifyEip3009` is now **total**: its whole body is inside the `try`. It used
  to do `a.to.toLowerCase()` and `BigInt(a.value)` *outside* the `try`, on a
  buyer-supplied object that `parsePaymentHeader` only checks at the top level
  (`signature` is a string, `payload` exists). An envelope with
  `payload: {}` — valid base64, valid JSON, no `authorization` — produced a
  `TypeError` and a **500** from a route whose contract is "unverified payment".
  `payload.authorization` is now typed as `unknown`-per-field
  (`RawAuthorization`) rather than `Hex`/`string`, so the `typeof` narrowing is
  real to the compiler instead of being a guard it believes cannot fire.
- `verifyPayment` consults the receipt cache **before** the nonce, so the
  legitimate retry the design depends on — same `X-PAYMENT`, same `paymentId`,
  D-011 — is not mistaken for a replay. Pinned by
  `keeps a retry of the same paymentId idempotent`.

**The durability gap, and how it closed.** The burn was an in-process `Set`, so
a restart or a second replica forgot it and replay worked again. That was
recorded here rather than implied away — which is why the wording above was
"replay works only across a restart" and not "replay is impossible", and why
`forgets which nonces it has seen when the process restarts` existed as a **test
that asserted the limitation** rather than a comment hoping nobody checked.

R-42 closed it. The burn is now a call on an injected `NonceStore`, and
`apps/api` injects `NonceRepository` — a `burned_nonces` table whose primary key
is a single `key` column holding the `(from, nonce)` pair joined by a colon
(`packages/okx-adapter/src/okx-adapter.ts:554`), so the insert *is* the
single-use check. The table is that one column plus `burned_at`
(`apps/api/src/db/client.ts:199-202`), and `burn` is a single
`INSERT … ON CONFLICT DO NOTHING` whose row count is the answer
(`apps/api/src/repositories/nonce-repository.ts:30-43`). This entry used to say
the primary key "is the `(from, nonce)` pair", which describes the value in the
column rather than the column.
`DECISIONS.md` D-040 records the reasoning, including why the burn does not need
to share a transaction with the job it pays for, and what the buyer gives up in
exchange for at-most-once. That test was replaced by
`refuses a replay after a restart, when both processes share the store`, which
asserts the property instead of the limitation; the old behaviour survives as
`still forgets when no store is injected`, which pins the default that
`packages/mcp-server` relies on.

**One finding from closing it, worth more than the fix.** `Promise.all` over a
cold `pg.Pool` does not race. The first version of the Postgres concurrency case
issued ten simultaneous burns and passed against a deliberately racy
`SELECT`-then-`INSERT` implementation, 3/3 — the pool establishes connections as
the event loop reaches them, and each new connection's queued work finishes
before the next connection is ready, so the ten calls run in sequence. Warming
the pool first makes it a real race, and the racy implementation then fails 3/3
on `duplicate key value violates unique constraint "burned_nonces_pkey"`. A
concurrency test that has never been shown to fail is not evidence of anything.

**What now pins it.** `packages/okx-adapter/src/okx-adapter.test.ts`:
`refuses a signature that has already bought an audit`,
`refuses an authorization whose window has already closed`,
`refuses an authorization that is not valid yet`,
`still accepts a second, independently signed authorization` (the guard keys on
the authorization, not the buyer),
`keeps a retry of the same paymentId idempotent`,
`refuses a replay after a restart, when both processes share the store` (R-42),
`still forgets when no store is injected — which is why the API injects one`
(R-42, pinning the default), and
`does not turn a store outage into a cached "failed"` (R-42).

**Mutation-checked.** Removing the `spentNonces` guard fails exactly
`refuses a signature that has already bought an audit`; removing the two window
comparisons fails exactly the two window tests. Both mutations restored
byte-identical (`sha256 0ba6757…`). A third mutation — deleting the `typeof`
guard — **survived**, and that is worth recording rather than hiding: the
`typeof` guard is not what makes the verifier total, the `try` is. It is
load-bearing for the *compiler* (without it, `a.from` is `unknown` and the
message construction does not type-check), and the runtime totality is pinned by
the pre-fix run above, not by that mutation.

**Related.** R-39 (the same rail, one layer up: the route could not accept a
payment at all), R-38 (a declared capability with no consumer), D-011 (each POST
mints a fresh `paymentId` — which is *why* there is always a new challenge to
point a stale signature at).

## R-42 — The burned-nonce record lived in the process, so a restart re-opened the rail

**Severity:** High
**Likelihood:** Certain — it happened on every restart and on every second
replica, which is the normal state of a deployed service
**Status:** **Fixed 2026-10-08 (R-40's follow-up).** See below.

**What happens.** R-40 made an EIP-3009 authorization single-use: the first
successful verification burns the `(from, nonce)` pair so a replayed signature
is refused. The record of what had been burned was a `Set` inside
`OkxPaymentAdapter` — which means it was a record of what *that process* had
burned. Two consequences, both silent:

1. **A restart forgets everything.** `docker compose restart api` re-opens every
   authorization that was already spent, and nothing in the logs says so: the
   replay verifies, the nonce is absent from the fresh `Set`, and the audit runs
   a second time for a payment that was already made.
2. **A second replica has its own memory.** `docker-compose.yml` runs one `api`
   service, but nothing stops a deployment from scaling it, and behind a load
   balancer a replay only has to land on a different instance to be accepted.

The guard was correct about *what* to remember and wrong about *where* to keep
it. This is the same shape as R-16 (an in-process queue) one layer down: state
that has to outlive the process, kept in the process.

**Why this entry is written now, and what it fixes.** Twelve references to
`R-42` existed across `RISKS.md`, `BACKLOG.md`, `PROJECT_STATE.md` and
`CHANGELOG.md` — including R-40's own `Status` line — and no entry by that name
was ever written. (This paragraph said fourteen; counted at `31532b3^`, the
commit before the heading was added, it is 5 + 1 + 2 + 4 = 12.) The references
were added with the fix and the entry was not,
so the file pointed at itself from four directions and a reader following any of
them arrived at nothing. Writing it down is the last piece of the fix, not
paperwork about it. (`R-41` is unused; the numbering jumps.)

**What the fix is.** The burn is a call on an injected `NonceStore`
(`packages/okx-adapter/src/nonce-store.ts`) with one method,
`burn(key): Promise<boolean>`, where `true` means "this call claimed it". The
adapter's default is still `InMemoryNonceStore`, so nothing changes for a
single-process deployment; `apps/api` injects a store that survives a restart
and is shared between replicas. `packages/mcp-server` deliberately keeps the
in-memory default, because it verifies payments only in mock mode and never
reaches a nonce. The interface is declared rather than concrete because the
question "does this survive a restart" is answered by the *caller*, which is the
only place that knows whether there is a second replica.

**What is still true.** `InMemoryNonceStore` is the adapter's default, so a
caller that forgets to inject one gets the old behaviour. That is deliberate —
the default has to be usable by the tests and by `mcp-server` — and it is
recorded here rather than left as a trap, together with the pinning test
(`refuses a replay after a restart, when both processes share the store`) that
makes the injected path the one with evidence behind it.

**Related.** R-40 (the single-use rule this makes durable), D-040 (a guard that
must survive a restart cannot live in the process), R-16 (the same mistake in
the queue), D-039 (a queue name belongs to the database, not the process).

---

## R-43 — A retryable failure could reach no terminal state, on either driver

**Severity:** Low
**Likelihood:** Confirmed — observed in `verify:release` on 2026-10-08
**Status:** Fixed 2026-10-08 — the attempt budget and the deadline moved into
`AuditWorker`, and both drivers now spend the same one. See *What the fix is*
for the two things this entry got wrong before the fix was written.

**What happens.** `AuditWorker.runOnce` classifies a failure, and when the
classification is *retryable* it deliberately leaves the row for the queue to
re-deliver. Nothing did.

The **inline** driver did not re-deliver at all: `buildAuditQueue` read
`retryLimit` and `jobTimeoutMs` and then passed the inline branch only `runOne`,
`shutdownGraceMs` and `concurrency`, and `InlineAuditQueue.dispatch()` caught the
throw and logged it. No retry, no terminal transition.

The **pg-boss** driver did re-deliver — and it made no difference, which is the
part this entry missed when it was written. The worker parked the row in
`processing`, and `runOnce` opens by skipping a job it finds in `processing`
("another worker is already running this"). So the redelivery arrived, found its
own previous attempt's leftovers, and returned without running anything.
`retryLimit` was configured, read, and meaningless. That `processing` was also
just untrue — nothing was processing it.

Either way the row never left `processing`, and nothing in the system would ever
move it. The only three writers of `status: 'failed'` are the worker's terminal
branch, `JobService.fail()` (which the worker does not call) and the HTTP layer;
there is no sweep or reconcile anywhere in the repository.

**Why Low and not High.** Production cannot select the inline driver:
`config.ts` refuses `NODE_ENV=production` with `AUDIT_QUEUE_DRIVER=inline`
(R-16). But the pg-boss half is reachable by a paying caller, so what this
actually cost production was the same thing it cost `verify:release`: a job row
that never goes terminal and a client that polls `GET /audits/:jobId` forever.

**Evidence.** `verify:release` step 11b audits a deliberately non-existent
repository and polls its job to a terminal state. It passed in 1 505 ms on the
first run of the day; on a later run the same step sat at HTTP 202 until the
gate's own budget expired. The two runs differ in *how the request failed*, and
that is the whole story: a clean 404 classifies as `REPO_NOT_FOUND`
(`retryable: false`), which the worker marks `failed` immediately, but a
*network* failure on the same request falls through `classify`'s regex
heuristic to `UPSTREAM_FAILED` (`retryable: true`) — the one path with no way
out. GitHub's anonymous rate limit was **not** the cause that time:
`/rate_limit` reported 52 of 60 requests remaining while the job sat there,
which is what ruled the quota explanation out rather than leaving it as a
plausible story.

Step 11b is a good witness because it was already asserting the right thing.
Its comment read "The queue retries once, then the job ends in `failed` state" —
true of neither driver until this fix, and nobody had checked.

**What the fix is.** The attempt budget and the deadline belong to the row and
the worker, not to the driver, because only the row knows how many attempts it
has had and pg-boss cannot tell the handler anything the row does not already
say. Concretely, in `AuditWorker`:

- The take increments `attempts`. A failure is terminal when the classification
  is permanent **or** when `attempts` has reached `retryLimit + 1`.
- A retryable failure with an attempt left parks the row in `queued`, not
  `processing` — true, and claimable by the guarded take, which is what makes
  the redelivery a retry instead of a no-op.
- One attempt is wrapped in a `AUDIT_QUEUE_JOB_TIMEOUT_MS` deadline, reported as
  the new `JOB_TIMEOUT` code. Without it a hang is the one failure no retry
  logic reaches: `catch` never runs.

`buildAuditQueue` now hands the inline driver the same `retryLimit` the pg-boss
driver gets, and `InlineAuditQueue` re-invokes `runOne` while the worker keeps
throwing. pg-boss's `expireInSeconds` gained 30 s of headroom over the worker's
deadline, because pg-boss's expiry kills the job without letting the worker
write the row — when the two bounds are equal, which one fires first is a coin
flip.

Two things this entry had wrong, both caught while writing the fix:

- It named `errorCode: 'UPSTREAM_FAILED'` for the expiry. That reports a cause
  nobody observed: a hung request is not a rejected one, and the two want
  different responses. Hence `JOB_TIMEOUT`.
- It scoped the defect to the inline driver. The pg-boss path was equally
  broken, one layer down, and a fix that only covered inline would have left the
  invariant false in production — the one place it is reachable.

**Residual, deliberately not fixed here.** `classify` tests
`/rate limit|429|403/` before `/not found|404/i`, unanchored, so a repo whose
name contains a bare `403` classifies as rate-limited (retryable) rather than
not-found (terminal). This fix shrinks the blast radius from "the row hangs
forever" to "one wasted retry", which is why it is now a nuisance rather than a
defect. Also unfixed, and larger: a job whose row cannot be *read* — a DB error
before the take — is left `queued` by the inline driver and logged, not
finalised. Finalising it would mark a job that was never audited as permanently
failed on the strength of a hiccup that may well be transient, and the write
would probably fail too. A sweep for stale non-terminal rows is the real answer
and is R-42's territory.

**Related.** R-16 (the inline driver reaching production — a different property
of the same driver), R-42 and D-039 (state that must outlive the process),
`apps/api/src/services/job-service.ts`, whose state diagram said
`processing -> failed (terminal, after retries)` — true of neither path, and the
diagram is part of the reason the gap was not obvious from the worker alone. The
tests are `apps/api/src/services/audit-worker.test.ts`, and all three mutations
of this fix (park in `processing` again, drop the exhaustion check, remove the
deadline) turn them red.

---

## R-44 — A worker that died mid-attempt left the job a client polls forever

**Severity:** High
**Likelihood:** Certain on every crash — an OOM-killed container, a deploy
during an attempt, a host restart. Nothing has to be unusual about it.
**Status:** Fixed 2026-10-16 — the reclaim is in `AuditWorker.runOnce`,
bounded by the queue's own redelivery window. See below for the two places
this almost went wrong.

**What happens.** R-43 fixed the *thrown* failure: a retryable error parks
the row in `queued` where a redelivery can claim it, and an exhausted budget
is written terminal. The crash case was untouched. `runOnce` opens by
skipping a job it finds in `processing` — correct while a worker holds it,
fatal when the worker died holding it. The row stays `processing`, the
redelivery pg-boss sends after `expireInSeconds` arrives, finds the dead
attempt's leftovers, and is dropped on the floor. The buyer has paid and
polls a 202 forever, and there is no sweep anywhere in the repository that
would move the row: the only writers of a terminal status are the worker's
own branches, `JobService.fail()` (which the worker does not call) and the
HTTP layer. Same dead end as R-43, reached by a different door — R-43's
entry said as much ("a sweep for stale non-terminal rows is the real
answer"), and this is the half of that answer that fits in one guarded
write.

**Why the bound is what it is.** A row may only be treated as abandoned
once the queue has given up on it, or two workers run the same job and one
of them burns the buyer's payment for nothing. So the reclaim bound
(`staleProcessingMs`) is derived from the same variable that feeds pg-boss's
`expireInSeconds` — `jobTimeoutMs + 30 s`, computed once in
`buildAuditQueue.ts` and handed to both. A live worker's attempt is inside
the deadline by definition, so it can never look older than the bound while
it is actually running.

**Two places this almost went wrong, both caught by tests rather than by
reading.**

- The reclaim re-reads the row before the take. Using the object loaded at
  the top of `runOnce` would write the crashed attempt's `attempts` value
  back unchanged — the crash would silently buy the retry budget an extra
  attempt, and the count on the row would be a lie the terminal decision is
  made from. The test pins `attempts: 2` after one crash and one reclaim.
- The guard is what makes it safe. The reclaim is a `processing → queued`
  write guarded on `expectedStatus: 'processing'`, and the take that follows
  is guarded on `'queued'`. A live worker and a reclaiming one cannot both
  win, and a reclaim that loses the race skips rather than double-running.

**What is still true.** A row whose `startedAt` is *null* — older than the
field itself — is reclaimed immediately, because an attempt with no start
time cannot be shown to be young. That is the right default for a crash
(which is what a missing `startedAt` means in practice) and it does mean a
row written by a future writer that omits the field would be reclaimed on
sight. The alternative — treating null as fresh — parks a crashed job
forever, which is the defect this entry exists to close.

**Related.** R-43 (the thrown-failure half of the same dead end, and the
entry that named this gap), R-16 (a queue that reaches production),
D-039 (a queue name belongs to the database, not the process).
`apps/api/src/services/audit-worker.test.ts` carries the two tests; removing
the reclaim turns both red.

---

## R-45 — The report cache key collapsed onto one bucket per repository

**Severity:** High
**Likelihood:** Certain for any repository whose default branch is neither
`main` nor `master` — and invisible, because the report that comes back
looks exactly like a fresh one.
**Status:** Fixed 2026-10-16 — the SHA resolves through the default branch,
and an unresolvable SHA bypasses the cache. See below.

**What happens.** The report cache key is built from
`{owner, repo, commitSha, mode, target, outputLanguage, includeLaunchCopy,
reportVersion}`, and `AuditWorker.executeWithCache` resolved `commitSha` by
guessing `main`, then `master`, then falling back to the literal string
`'unknown'`. Both names are conventions rather than guarantees: a repository
defaulted to `develop`, `trunk` or `v1` answers 404 to each guess, and
GitHub's 403 under rate limiting collapses them the same way. The key then
read `…/unknown` for every audit of such a repository at every commit, so
the first report was served for the whole TTL to every subsequent buyer — a
stale verdict about code they had paid to have analysed. The cache metadata
on the completed row said `hit: true`, which was true and useless: it
reported a hit on a bucket, not on an answer.

**What the fix is.** The SHA is resolved through the repository's *default*
branch — `MetadataAnalyzer.getDefaultBranch()` asks GitHub what the branch
is, and only then is `getHeadSha` called with it. When the default branch
cannot be resolved, the cache is bypassed entirely: `runAudit()` runs and
the row records `hit: false, expiresAt: null`, because a key without a
resolved SHA is not a key, it is a bucket. The route records the same
resolution on the job row, so the value the caller was quoted and the value
the worker keys on agree — one resolution, one meaning, and `null` means
"GitHub could not be reached" rather than being interchangeable with a
sentinel string.

**What is still true.** A repository whose default branch cannot be reached
— GitHub down, rate-limited, or an anonymous hour exhausted — is not cached
at all, for as long as that lasts. The cost is one audit per affected job,
which is the honest price of serving a correct report; the alternative was
serving an arbitrary old one.

**Related.** R-24 (a header the client wrote, believed as an address — the
same shape of trusting an unverified input one layer down), D-011 (the
unique index that keeps two jobs from colliding on a payment, mirrored here
by the key's eight dimensions). The two tests live in
`apps/api/src/services/audit-worker.test.ts`; restoring the `main`/`master`
guesses turns both red.

---

## R-46 — A completed audit was re-served to anyone who knew its idempotency key

**Severity:** High
**Likelihood:** Certain for any caller who replays a key — including the
buyer's own client retrying after a network blip, which is the shape that
makes this a revenue hole rather than a curiosity.
**Status:** Fixed 2026-10-16 — the completed-row branch is gated on the
`X-PAYMENT` header. See below.

**What happens.** The POST handler looked the job up by `Idempotency-Key`
first, and an existing completed row short-circuited *before* payment
verification: pay once under a key, re-post the same key with no
`X-PAYMENT` header, and the report came back in full. The key is
client-chosen and binds to nothing — it is not an identity, and knowing one
is not evidence of having paid for the job it names. This is the same class
as R-40 (one authorization, unlimited audits) reached through a different
door: the payment gate sat *after* the short-circuit instead of before it.

**What the fix is.** The completed-row branch requires the `X-PAYMENT`
header to name *that job's* payment — `readPaymentId` parses it through the
adapter, so a header that names a different job's payment is a request to
pay for this one, not a request to read it. Without it the route answers 402
with a fresh challenge attached to the same job row, and the `status` field
tells the truth about what the row is.

**Why the challenge is attached to the completed row.** Without the attach,
a caller who pays the new challenge and replays gets a 402 again — the row
still names the old payment — and that loops forever while burning real
nonces. With it, the second payment matches `job.paymentId` and the replay
delivers the report: the operator is paid for what is served, and the
caller gets an answer. The attach overwrites the original `paymentId`; the
original payer already holds the report (it was delivered on completion),
and the alternative — a payment-id history — is more machinery than the
defect earns.

**What is still true.** The `payment_id` column being UNIQUE means each 402
carries its own challenge (D-011), so a caller who replays the key many
times accumulates challenges on the row, each replacing the last. The row
names the most recent one, which is the one a fresh payment would present.

**Related.** R-40 (one authorization, unlimited audits — the same class,
different door), D-011 (why every POST gets its own challenge). The
integration test is in `apps/api/src/tests/api.integration.test.ts`; moving
the short-circuit back above the verification turns it red.

## R-47 — A forged `X-PAYMENT` returned a paid report for nothing

**Severity:** High
**Likelihood:** Certain, and cheap: the value the gate compared against is
printed in the 402 response body.
**Status:** Fixed 2026-10-19 — the completed-row branch verifies the payment
instead of parsing it.

**What happened.** R-46 closed the *no-header* door on the completed row. The
door beside it stayed open. That branch asked the adapter to **parse** the
header (`readPaymentId`) and compared the result to `job.paymentId` — and
`paymentId` is a value this service hands out in the 402 body. An envelope
with `signature: "0x00"` and the right `payload.paymentId` therefore returned
the report: no signature, no `from`, no amount, no time window, no nonce. The
two doors are the same mistake at different strengths: *knowing a paymentId*
was treated as *having paid*.

**What the fix is.** The branch calls `adapter.verifyPayment`, which is the
only thing in this codebase that checks an EIP-712 signature and burns a
nonce. A receipt that is not `completed` falls through to the re-quote path,
so a caller with a malformed or unsigned envelope is answered 402 — with a
fresh challenge naming a *different* payment — rather than 200.

**Why no test caught it.** Every payment test in the repository ran in mock
mode, where `mock:<id>` is proof by construction and `verifyPayment` and
`readPaymentId` agree on everything. The new case is in
`apps/api/src/tests/okx-payment.test.ts` and needs three steps: quote under
mock to learn the paymentId, pay it so the row reaches `completed`, then
attack it under the `okx` rail with an unsigned envelope. Reverting the gate
to the string comparison turns it red with `expected 200 to be 402`.

**Related.** R-46, R-39, R-40.

## R-48 — The quality contract answered `pass` about findings the report never carried

**Severity:** High — the product's central claim is the release verdict.
**Likelihood:** Certain for every repository; the question was only which
checks lied.
**Status:** Fixed 2026-10-19 — the two missing categories are written down.

**What happened.** `collectFindings()` reads five arrays off `Report`. The
builder computed `reproducibilityFindings` and `deploymentFindings`, passed
them to `collectBlockers` (which keeps only critical/high) and to the score,
and **never wrote them into the report**. Every contract rule phrased as "is
this rule's finding present?" therefore answered `absent` for the rules that
fire at medium or low — and those rules' polarity makes `absent` mean *pass*.

Measured on a repository containing one README and nothing else: `CI-001`,
`TEST-002`, `TEST-003`, `BUILD-001`, `BUILD-002` and `BUILD-003` appeared zero
times in the report, and the contract returned `ci.workflow => pass`,
`testing.test-script => pass`, `release.build-path => pass`. A repository with
no CI, no test command and no build path was told it could ship.

**What the fix is.** Both fields are in `ReportSchema` (defaulted to `[]`, so
a stored report still parses), written by the builder, and read by
`collectFindings`. `REPORT_VERSION` moved to 1.4: a field was added to a
document consumers read.

**What is still not honest, and why it is recorded rather than fixed.** The
contract has no notion of *inapplicable*. `TEST-002` and `BUILD-002` only fire
when a manifest exists, so a repository with no `package.json` at all still
answers `pass` for "a test command is declared" — the rule did not run, and
absence of a finding is read as success. Fixing that needs a positive signal
in the report (a manifest record) or a third check status; both are larger
than the defect's blast radius for the repositories this tool targets, all of
which ship a manifest. `ci.workflow` and `release.build-path` do fail now for
that repository, which is the half that had a rule that always fires.

## R-49 — Every cached audit on Postgres failed, retryably, forever

**Severity:** High — the entire paid path on the production database.
**Likelihood:** Certain whenever `REPORT_CACHE_ENABLED=true` on Postgres.
**Status:** Fixed 2026-10-19.

**What happened.** `ReportCacheRepository.findByKey` did
`JSON.parse(row.report)`. On SQLite the column is `TEXT` and comes back as a
string; on Postgres it is `JSONB` and `node-postgres` hands back an **object**.
`JSON.parse(object)` throws `SyntaxError: "[object Object]" is not valid JSON`.
The throw happens inside the worker, is classified `UPSTREAM_FAILED` and
marked **retryable**, so the job burns its whole attempt budget and lands in
`failed` — a cache *read* turning into a failed audit, on every audit, for as
long as the cache is on.

**Why it survived.** The repository had no Postgres test. Every test of the
cache used a fake repository, so the real class never met a real driver. The
sibling `job-repository.ts:239` already handled the dual shape; this one was
written by copying the SQLite branch and never exercised on the other backend.

**What the fix is.** The same normalisation the job repository uses — parse
only when the value is a string — plus a type that stops claiming `report:
string` for a column that is not a string. Three cases in
`apps/api/src/services/cache-service.test.ts` drive the real repository with a
pool that behaves the way `node-postgres` does; restoring `JSON.parse` turns
the Postgres one red.

## R-50 — "Does this file exist?" was asked of the files the audit chose to read

**Severity:** Medium — a high-severity false finding, and a silent false
negative of the same origin.
**Likelihood:** Any repository with a file over `MAX_FILE_BYTES` (1 MiB) or
past `MAX_FILES`.
**Status:** Fixed 2026-10-19.

**What happened.** `filterFiles` drops binaries, noise directories and
anything over the size cap. `analyzeReproducibility` was given that filtered
list and asked it whether a lockfile exists. A repository with a 2 MiB
`pnpm-lock.yaml` was told **"No lockfile detected" at high severity** — a
finding a paid customer would act on, about a file they had committed. The
same filter dropped a 2 MiB `.env`, which then appeared in **no count at
all**: not read, and not reported as unread, so "no secrets found" covered a
file nobody opened.

**What the fix is.** The analyzer takes paths, and the builder passes
`allPaths` — the unfiltered tree, which the pipeline already had for exactly
this reason and used for documentation and hackathon checks. Files the cap
kept out of selection are now counted (`unreadableBeforeFetch`) and included
in the coverage limitation, which already said "or absent from the archive"
and now says "files the tree listed" because that is what it means.

**Verified.** With a 2 MiB lockfile and a 2 MiB `.env`: no lockfile finding,
and `Content was truncated out of this audit: 2 of 4 files the tree listed
could not be read`. Before the change the same probe produced the high
severity blocker and no limitation.

## R-51 — The price gate read six of the seven places a price is stated

**Severity:** Medium — the defect it exists to prevent is a failed first sale.
**Likelihood:** Low, but the gate is the only thing standing between a
listing and a charge.
**Status:** Fixed 2026-10-19.

**What happened.** `readPriceStatements()` collected the API default,
`.env.example`, the compose default, both marketplace listings and the
registration table — and not `DEFAULT_PRICING.audit.amount`, which is what the
**MCP binary** charges when `PRICE_AUDIT` is unset. Changing that `'1'` to
`'0.55'` left `docs:check` reporting zero issues. The docstring above the
function describes this exact failure mode (a buyer reads one number, signs
another) and the list had a hole in it.

**What the fix is.** A seventh statement, read with `required()` so a reworded
constant fails loudly rather than silently dropping out of the list, and
`EXPECTED_STATEMENTS` 6 → 7. Mutation-verified: the `'0.55'` change now fails
with "stated 2 different ways".

## R-52 — The compose secret rule compared the value, not the key

**Severity:** Medium — a gate that could not fire, guarding the file that
holds deployment credentials.
**Likelihood:** Certain: no correct value could ever match.
**Status:** Fixed 2026-10-19.

**What happened.** The rule was
`/KEY=|SECRET=|PASSWORD=|TOKEN=/.test(v)` where `v` is the env **value**. It
could only match a value that literally contained the text `PASSWORD=` — which
no credential does. `MY_TOKEN: ghp_realtoken…` passed, and so did
`POSTGRES_PASSWORD: repopilot` in this repository's own compose file. The
irony is exact: the one real hardcoded credential in the file passed because
its value does not contain the word `PASSWORD`.

**What the fix is.** Match the **key** against
`/(^|_)(KEY|SECRET|PASSWORD|TOKEN|CREDENTIAL|PASSWD)S?$/i`, and exempt only the
`${VAR}` interpolation form. The rule now fires on the file, so the file was
changed too: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-repopilot}`, same
default, overridable. Mutation-verified both directions — a literal
`GITHUB_TOKEN: ghp_…` fails the gate, and the shipped file passes.

## R-53 — The MCP binary guessed at its own configuration

**Severity:** Medium — a silent free-audit server, and an invalid number in a
signed challenge.
**Likelihood:** Any typo in `PAYMENT_MODE`, any non-numeric `PRICE_AUDIT`.
**Status:** Fixed 2026-10-19.

**What happened.** `cli.ts` resolved its mode as
`PAYMENT_MODE === 'okx' ? 'okx' : 'mock'`. `PAYMENT_MODE=Okx`, `ok`, or any
misspelling produced a server that hands out audits for free — no log line, no
failed request, and `NODE_ENV=production` did not matter because this binary
never ran the API's production guards (R-02). `PRICE_AUDIT` was passed through
untouched, so `PRICE_AUDIT=abc` reached `toAtomic` and became `abc000000` in
the 402 challenge: the first buyer would sign an authorization for something
that is not a number.

**What the fix is.** The environment read moved to `payment-env.ts`, a pure
function of an environment object, and it refuses rather than guesses: an
unknown `PAYMENT_MODE` is an error, `mock` with `NODE_ENV=production` is an
error, `okx` with no `OKX_PAYMENT_ADDRESS` is an error, and `PRICE_AUDIT` must
be a positive decimal with at most six places. `cli.ts` prints the message and
exits 1. Eight cases in `payment-env.test.ts` cover the refusals.

The API's own `PRICE_AUDIT` gained the same shape check in `ConfigSchema`,
which is where the value enters the other process; `'0'` is refused as well,
because a well-formed zero makes every audit free and is a deployment mistake
far more often than an intent.

## R-54 — A web3 finding appeared twice in `blockers` and twice in the task list

**Severity:** Low — a crowded report, not a wrong verdict.
**Likelihood:** Every web3 repository.
**Status:** Fixed 2026-10-19.

**What happened.** `deploymentFindings` is built as
`[...repro subset, ...web3Findings.filter(f => f.id.startsWith('web3-'))]`, and
`collectBlockers` was handed `deploymentFindings` **and** `web3Findings`. Every
high-severity web3 finding was therefore in `blockers` twice, and
`recommendedTasks` iterates `blockers`, so it appeared twice there as well —
6 entries for 5 findings in the measured case, on a list capped at 25 and 12.

**What the fix is.** Deduplicated by object reference. The duplication is
literal — the same object sits in both arrays — so identity is exact, and an
id-based merge would be wrong as soon as two genuinely different findings share
an id (two contract directories with no deploy script are two findings).

## R-55 — Two different credentials in one file produced one history finding

**Severity:** Medium — a responder rotates the key they were told about and
leaves the other one live.
**Likelihood:** Any file holding more than one secret of the same kind.
**Status:** Fixed 2026-10-19.

**What happened.** The history scanner deduplicated across commits by
`${kind}::${file}::${reason}`, and `reason` is a **constant per pattern**
(`'AWS access key ID pattern'`). Two AWS keys in one file therefore collapsed
into one finding, contradicting the function's own docstring ("two
introductions = two findings").

**What the fix is.** The key is `${kind}::${file}::${line text}`. Two
different secrets differ in the text; the same secret edited around keeps it,
which is the case the dedupe exists for. The cost is that the *same* key on
two lines of one file now produces two findings — over-reporting in the safe
direction. New case in `history-scanner.test.ts`; restoring `hit.reason` turns
it red (2 → 1).

## R-56 — An `Idempotency-Key` was a global namespace with no binding

**Severity:** Medium — cross-caller report access with a guessable key.
**Likelihood:** Low in practice (the poll endpoint needs the jobId), but the
key is client-chosen and often predictable.
**Status:** Fixed 2026-10-19.

**What happened.** `getByIdempotencyKey(key)` had no scope: any caller who
presented a key that matched an existing job got that job — `jobId`, status
and, on the completed path, the report. Submitting a different `repoUrl` under
the same key returned the *other* repository's job. Reusing a key with a
different body is not a retry; it is a collision, and it was answered as a
successful retry.

**What the fix is.** The stored `input` is compared to the incoming one
(`repoUrl` normalised for trailing slash, whitespace and case; `mode`,
`target`, `outputLanguage` and `includeLaunchCopy` exactly). A mismatch is
`409 IDEMPOTENCY_KEY_REUSED`. That is also what keeps the unique index from
turning the collision into a 500 inside `create`.

**What is still true.** There is no caller identity in this flow, so a key
remains a shared namespace: two callers who *deliberately* use the same key
for the same request share a job. That is the semantics of the header, and
closing it would need authentication, which this service does not have.

## R-57 — Payment challenges and receipts live in process memory

**Severity:** Medium
**Likelihood:** Certain on a multi-replica deployment; zero on the shipped
single-container compose.
**Status:** **Accepted residual** — decided, not deferred by omission. R-42
persisted the burned nonce; the challenge and the receipt did not follow.

**What happens.** `OkxPaymentAdapter` keeps issued challenges and settled
receipts in `Map`s inside the process. With one replica that is correct. With
two behind a load balancer, a buyer's second request can land on the instance
that did not issue the challenge: `verifyPayment` does not find it, and the
route answers 402 `PAYMENT_NOT_SETTLED` for an authorization that is perfectly
valid on chain. A client that treats 402 as terminal abandons a payment it has
already signed.

**Why it is recorded rather than fixed.** The fix is a table and a repository,
mirroring `burned_nonces` — the third persistence layer in a payment path whose
first two were added one defect at a time. The shipped topology is a single
`api` container; `docs/DEPLOYMENT.md` does not describe a scaled deployment.
Doing it now would be building for a shape nobody runs, and the honest signal
is this entry rather than a half-built table. **If this service is ever run
with more than one replica, this becomes a High and must be fixed first.**

## R-58 — Two contract checks read "the rule did not run" as "the rule passed"

**Severity:** Medium
**Likelihood:** Any repository with no dependency manifest at all.
**Status:** Fixed 2026-10-22.

**What happened.** `testing.test-script` and `release.build-path` were answered
by the *absence* of `TEST-002` / `BUILD-002`. Those rules only fire when a
`package.json` exists, so a repository with no manifest at all — a bare
documentation repo, a Go project, a Rust project with no `Cargo.toml` at the
root — answered `pass` for "a test command is declared" without anything having
been checked. `release.build-path` was worse in one direction: it was
`ok = noDocker.length === 0 || noRunScript.length === 0`, so a missing
Dockerfile plus an inapplicable run-script rule read as "has a build path".
This is the polarity trap in its general form: the rule asks "is this defect
present?", so a rule that could not run is indistinguishable from a rule that
found nothing.

**What the fix is.** The report now carries `manifests`: the dependency
manifests found in the tree, from the same unfiltered path list the existence
checks read. `REPORT_VERSION` moves to `1.5`. The field is **optional**, and
absent means nothing is claimed — the report predates the field, or the tree
listing was truncated — rather than "there are none". A stored 1.4 report
asserts nothing about which files exist, and defaulting to `[]` would make it
assert something it never looked at; a truncated listing cannot support "the
tree holds none" either, so the builder omits the field there too.

Both checks read it through `rootManifestState()`, which answers `true` /
`false` / `undefined` for the **root** `package.json` specifically, because that
is the file `TEST-002` and `BUILD-002` open. When it is `false`, the check
returns `warn` with the reason in `observed` instead of a `pass`:

> not evaluated: the repository has no root package.json, which is the only
> file this rule reads

`warn`, not a new `not_applicable` status, because the contract's vocabulary
already means this — `pass_with_warnings` is documented as "nothing blocking,
but something could not be evaluated". It does not block: having no manifest
fails nothing. It simply does not answer the question, and a green tick said it
did.

A monorepo whose manifests all sit under `packages/*` lands in the same bucket
as one with none. That is deliberate: `TEST-002` reads the root file, so
answering from a nested manifest would be a new guess in place of the old one.

**Verification.** Seven cases in `contract.test.ts` under *a check the report
cannot answer*: `manifests: []` warns on `testing.test-script` and leaves
`ship` true with status `pass_with_warnings`; the same with `BUILD-001` present
warns on `release.build-path`; a Dockerfile with no manifest still passes the
build path; `manifests: ['package.json']` and `manifests: undefined` behave
exactly as before; a nested manifest is not mistaken for the root one. Three
builder cases pin the evidence itself — the tree's manifest is listed, its
lockfile is not, a tree with none yields `[]`, and a truncated listing claims
nothing at all. Mutation: forcing either `hasRootManifest === false` branch to
`false` turns the corresponding warn cases red (3 and 1 respectively); deleting
the builder's `manifests` line turns two of its cases red, and dropping the
truncation guard turns the third red.

## R-59 — An added line starting with a double plus was read as a file header

**Severity:** Medium — a credential that is not reported, at the wrong line
number when it is.
**Likelihood:** Certain for any commit that adds a line whose own text begins
with `++` — a counter increment, a `++i` in a loop header, a pre-increment
assignment.
**Status:** Fixed 2026-10-19.

**What happened.** `addedLines()` decided what was a file header by prefix:
`if (raw.startsWith('+++') || raw.startsWith('---')) continue`. In a unified
diff an added line is written `+` followed by its text, so a line whose text
starts with `++` produces `+++…` — indistinguishable from the `+++ b/file` header
by prefix alone. Two consequences, both silent: the line was **never scanned**,
and because it also skipped the `newLine += 1`, every finding below it in the
same hunk was reported **one line early**.

**What the fix is.** The header filter is positional now. A `@@` sets
`inHunk = true` and a `diff --git` line clears it; outside a hunk nothing is
content, inside one nothing is a header. Position is knowable from the diff —
the hunk declares where it starts — and the prefix never was.

**Verification.** `addedLines` case `reads an added line that starts with ++ as
content, not as a header` asserts both halves at once: two added lines, at lines
2 and 3. Restoring the prefix filter turns it red with
`expected [ { line: 2, text: 'const b = 2;' } ] to deeply equal [ …(2) ]` —
which is the miss *and* the off-by-one in one message.

**Related.** R-55 (the other dedupe defect in this scanner). Both were found by
reading the function against its own docstring rather than by a failing test.

## R-60 — A timestamp tie named the newer commit as the introduction

**Severity:** Medium — the one field a responder acts on.
**Likelihood:** Low per repository, certain per rebase or scripted push: commit
dates have second granularity, and two commits can share one.
**Status:** Fixed 2026-10-19.

**What happened.** `scanCommitsForSecrets` sorts oldest-first so that the
dedupe keeps the commit that *introduced* a credential — "the one a responder
needs", per its own comment. The sort was
`[...commits].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))`, and
`Array.prototype.sort` is stable, so two commits sharing a timestamp kept the
order they arrived in. They arrive newest-first (that is GitHub's order), so the
tie was won by the **newer** commit: the report named a commit that contains the
secret rather than the one that added it, and history rewriting would start in
the wrong place.

**What the fix is.** `.reverse()` before the sort. With the input oldest-first,
a stable sort leaves a tie oldest-first. A commit whose date could not be read
now sorts last (`'9999'`) rather than first: an unknown date is not an ancient
one, and preferring the dated commit is the only ordering that is not a guess.

**Verification.** New case `keeps the older commit when two carry the same
timestamp`, driving the input in GitHub's order with one shared date. Removing
the `.reverse()` turns it red with
`expected 'tidy config' to be 'add config'`.

## R-61 — A truncated tree was reported as an unreadable archive

**Severity:** Low — a false sentence in a shipped artifact, about the one thing
the artifact is for.
**Likelihood:** Certain for any repository large enough that GitHub truncates
the tree.
**Status:** Fixed 2026-10-19.

**What happened.** `buildRepositoryMap` folds two different facts into one flag:
`const degraded = Boolean(input.degraded) || Boolean(input.truncated)`. That is
defensible for the flag — a map built from a truncated tree really is less
complete — but the *sentence* the flag drives says something else entirely:
"The archive could not be read (…), so content was fetched one file at a time
(ADR D-017); the request cost was higher". A truncated tree therefore produced
two limitation lines: the true one about truncation, and a false one claiming
the archive failed and every file was fetched individually. Neither had
happened.

**What the fix is.** The limitation builder is handed the raw
`Boolean(input.degraded)`; the artifact keeps the folded flag. One line, and the
two facts stop sharing a sentence.

**Verification.** The existing case `treats a truncated tree as degraded` now
also asserts the false sentence is absent (`not.toContain('one file at a
time')`, `not.toContain('archive')`). Restoring the folded flag turns it red
with `expected 'Static analysis only — repository cod…' not to contain 'one
file at a time'`. The flag assertion still passes, which is the point: the
decision was right and the explanation was wrong.

## R-62 — An OKX buyer saw a blank page when capabilities failed

**Severity:** Medium — a dead end on the paid path, with no error to report.
**Likelihood:** Low, and exactly the deployments that are hardest to debug: a
proxy rule, an ad-blocker, a cold start, a partial outage.
**Status:** Fixed 2026-10-19.

**What happened.** `App.tsx` renders the payment instructions only when
`caps?.paymentMode === 'okx'`. `caps` comes from `getCapabilities()` at mount,
whose rejection is swallowed (`.catch(() => undefined)`). So when
`/capabilities` was unreachable and `/audits` was not, an OKX buyer received a
402, the app stored the `paymentId`, skipped the mock auto-pay (it branches on
`challenge.mode`, which it had), rendered no card (it gated on `caps`, which it
did not) — and showed nothing at all. No error, no instructions, no spinner.

**What the fix is.** The mode the *challenge* names is remembered in state and
preferred over the capabilities answer. The 402 body is the answer to this
request; `caps` is a cached guess about the deployment.

**Verification.** New case `capabilities 请求失败时，okx 买家仍然看到付款指引`
drives `capabilities: 'network'` with `challengeMode: 'okx'` and asserts the CLI
command is on screen. Restoring `caps?.paymentMode` turns it red with
`Unable to find an element with the text: /onchainos payment pay …/`.

## R-63 — Two documented knobs that no module read

**Severity:** Low — but it is the class this file keeps writing entries about:
a green tick over a setting that does nothing.
**Likelihood:** Certain for anyone who copies `.env.example` and tunes the
timeouts.
**Status:** Fixed 2026-10-19.

**What happened.** `.env.example` declared `FETCH_TIMEOUT_MS=30000` and
`ANALYSIS_TIMEOUT_MS=120000` in its Limits block. Neither is read anywhere: the
GitHub client's timeout is a compile-time constant in
`packages/core/src/git/fetcher.ts`, and `JOB_TIMEOUT_MS` is the value that
actually bounds a run. `ANALYSIS_TIMEOUT_MS` had already been removed from
`scripts/env-check.ts` for this exact reason (R-39) — with a comment saying so —
and the example file kept advertising it.

**What the fix is.** Both lines are gone, replaced by a note naming the two real
knobs and why the absent ones are not coming back under those names. The note is
in the file rather than only in this entry because the file is what an operator
reads.

**Verification.** `pnpm env:check` and `docs:check` both still pass; no code
path referenced either name (checked by searching the tree, not by assuming the
comment in `env-check.ts` was complete).

## R-64 — An assertion that could not fail

**Severity:** Low.
**Likelihood:** Certain, in the sense that it was already true.
**Status:** Fixed 2026-10-19.

**What happened.** `packages/mcp-server/src/index.test.ts` opened with
`it('builds and registers tools')` whose body was
`expect(server).toBeTruthy(); expect(toolNames(server).length).toBeGreaterThan(0)`.
The first assertion cannot fail — `buildMcpServer` returns an object — and the
second is implied by the two frozen-list cases below it, which compare the
registration against `ADVERTISED_TOOLS` in both directions. The test's name
promised a check of the tool list that three other tests were already making.

**What the fix is.** Removed, with a comment saying what it claimed and which
cases make the claim. A green tick that cannot go red is worse than no tick: it
occupies the name of a check nobody then writes.

## R-65 — The raw failure message is stored and served to anyone with the job id

**Severity:** Low — disclosure of infrastructure detail to a caller who already
holds the job id.
**Likelihood:** Medium: every failed audit takes this path, and
`classify()` passes through the message of whatever was thrown.
**Status:** Fixed 2026-10-21 — the column holds a fixed sentence per
`errorCode`; the thrown message goes to the log.

**What happened.** `audit-worker.ts:248` wrote `error: auditErr.message` onto
the job row; `GET /api/v1/audits/:jobId` returns it verbatim as
`error.message` (`audits.ts:467`). The message was whatever the underlying
library put in the error: a pg connection failure named host and port, an
Octokit error carried the request it failed on, a Zod error carried the input
shape. The 500 handler in `utils/errors.ts` deliberately answers a flat
`Internal error`; this path had no such policy.

**What the fix is.** `PUBLIC_ERROR_MESSAGES` (`audit-worker.ts:110`) is a
`Record<AuditErrorCode, string>`, and the failure write stores
`publicErrorMessage(auditErr.code)` instead of the message. `Record` rather than
a lookup with a fallback: adding a code now fails the typecheck there, or the
new code silently inherits a sentence about something else.

The sentences say what the caller can do and nothing about what broke —
"GitHub rate-limited this audit" rather than the 403 and the installation id.
The thrown message is not lost: it is on the `audit job failed` log line above,
keyed by `jobId`, which is where an operator looks. Writing the safe value at
the write rather than at the route is deliberate — the row then never contains
the leak, so any future reader is safe by construction rather than by policy.

`audit-worker.test.ts` feeds a `connect ECONNREFUSED 10.0.0.5:5432` through the
pipeline and asserts the stored value is the fixed sentence and contains neither
the host nor `ECONNREFUSED`. The deadline case asserts `JOB_TIMEOUT`'s sentence
and that the configured `150ms` is gone from the row. Storing the raw message
again turns both red.

## R-66 — Two concurrent first uses of one idempotency key answer 500

**Severity:** Low — a spurious 500 on a retry, not a wrong answer.
**Likelihood:** Low, and proportional to how often clients retry a POST that
timed out, which is the case the header exists for.
**Status:** Fixed 2026-10-21 — the key is written with the row, and the
collision returns the winner.

**What happened.** `handleCreate` read `getByIdempotencyKey`, then called
`create`, which inserted the row and *then* wrote the key in a second statement
(`job-service.ts:67-70`). Two requests racing on a fresh key both found
nothing, both inserted, and the second write hit `uq_jobs_idempotency_key`.
Nothing caught it, so it surfaced as `Internal error` with status 500. The
two-statement create had a second, narrower window: a crash between insert and
update left a queued job with no key, and the client's retry then created a
second job.

**What the fix is.** `JobRepository.insert` takes the key as a third argument
and writes it in the same statement, so the second window is gone. The
collision that remains is a fact about the race, and `create` catches exactly
that one: `isIdempotencyKeyCollision` (`job-repository.ts:34`) recognises
Postgres `23505` on `uq_jobs_idempotency_key` and SQLite's
`SQLITE_CONSTRAINT*` on `jobs.idempotency_key`, then re-reads the winner and
returns `{ job, created: false }`.

Catching every insert failure instead would have been shorter and worse — a
genuine database error would be reported as "someone else won the race". The
Postgres branch checks the constraint *name* for the same reason: the
`payment_id` index is unique too, and a duplicate payment proof is a different
event.

`create` now returns `{ job, created }`, so the two call sites in
`routes/audits.ts` can tell the two cases apart. The 402 path answers a lost
race with the same 202 the found-job branch gives: quoting a second challenge
onto the winner's row would invalidate the first client's payment proof, and
that client has not been told anything yet.

`tests/sqlite.integration.test.ts` opens two connections to one file — the
smallest faithful model of the race — has both read "no job for this key"
before either writes, then asserts the second call returns the winner *and*
that the table holds one row. Reverting to the two-statement create leaves two
rows and turns that case red.

## R-67 — An unknown payment network is half-applied

**Severity:** Medium when it fires: the buyer is told to pay on a chain that
does not exist.
**Likelihood:** Low — it needed a typo in `OKX_PAYMENT_NETWORK`.
**Status:** Fixed 2026-10-21 — the name is a closed union, and the fallback is
gone.

**What happened.** `OKX_PAYMENT_NETWORK` was `z.string().default('xlayer')` — no
enum. `createChallenge` wrote `network: this.opts.network` into the challenge
(so the buyer's wallet was pointed at `xlayer2`, say) while taking the token
address and `decimals` from `USDT_BY_NETWORK[network] ?? USDT_BY_NETWORK['xlayer']`,
and `verifyPayment` derived the EIP-712 domain from `chainId: 196`. The result
failed closed — a signature made for another chain does not verify — so no audit
was given away; what was lost was the buyer's payment attempt, in their wallet,
with no server-side signal that the configuration was wrong.

**What the fix is.** `SUPPORTED_NETWORKS` (`okx-adapter.ts:193`) is the key set
of `USDT_BY_NETWORK`, and `OkxPaymentAdapterOptions.network` is now its union
type, so a name cannot exist without a token contract, a decimals value and a
chain id behind it. Both lookups lost their `?? USDT_BY_NETWORK['xlayer']`
fallback: with the union there is nothing to fall back *from*, and the fallback
was the half-application.

Two gates, each with its own job. `apps/api/src/config.ts` parses
`OKX_PAYMENT_NETWORK` with `z.enum(SUPPORTED_NETWORKS)`, so a typo fails at
startup with the variable named and the alternatives listed.
`buildPaymentAdapter` refuses a name outside the set for every other caller —
`packages/mcp-server`, the smoke scripts, tests — because `PaymentConfig` is a
plain interface that carries strings, and the factory is the one place both
rails are chosen.

The consequence the entry flagged as the reason to wait is real and is the
point: a deployment carrying a name outside the set now **refuses to start**.
That is the honest failure. The previous behaviour was to start, quote, and lose
the buyer's payment in a wallet.

`factory.test.ts` rejects six realistic wrong values — `xlayer2`, `optimism`,
`polygon`, `XLayer`, `" xlayer"`, `""` — and asserts the message names the
variable, the value it got and the five it accepts. `okx-adapter.test.ts` walks
all five and asserts each challenge quotes that chain's USDT. Removing the
factory guard fails eight cases; hardcoding the xlayer row in `createChallenge`
fails the per-network asset assertion.

## R-68 — The launch checklist reads the secret list from before the split

**Severity:** Low — an internal contradiction between two lines of one report.
**Likelihood:** Certain for any repository with a fixture credential.
**Status:** Fixed 2026-10-21 — the checklist reads the post-split secret subset.

**What happened.** `buildLaunchChecklist(..., secretFindings, ...)` was handed
`toSecretFindings(secretDrafts)` — the array *before* `split()` moved fixture
paths out of it and before `enrichFindings` ran. `securityFindings`, the
post-split array, is what the score, `collectBlockers` and the quality contract
read. So a fake credential under `src/**/*.test.ts` made `check-secrets` report
`done: false` ("No committed credentials" not met) while
`security.no-secrets` in the same report said `pass` and the score ignored it.
One report, two answers, and the checklist is the one a human reads.

**What the fix is.** The builder captures the ids of the pre-split secret
findings in a `Set` (`builder.ts:140`) and passes
`securityFindings.filter((f) => secretFindingIds.has(f.id))` — the same
findings, after the split removed the fixture ones.

By id rather than by `id.startsWith('secret-')`, which is the obvious one-liner
and the wrong one: `securityFindings` also carries `secret-history-*` rows, and
"a credential was committed at some point" is a different claim from "no
committed credentials". A prefix match would merge the two and fail the row on
a history hit — the same defect, one level down.

`fixture-split.test.ts` pins both directions: a credential under `tests/` leaves
the row `done: true` while the finding sits in `fixtureFindings`, a credential
in `src/` fails it, and a `secret-history-*` finding in `securityFindings` does
not. Passing the pre-split array fails the first; switching the filter to a
prefix match fails the third.

## R-69 — Blockers and recommended tasks are truncated in silence

**Severity:** Low — a reader believes the list is complete when it is not.
**Likelihood:** Certain above 25 blockers or 12 tasks.
**Status:** Fixed 2026-10-21 — the caps are disclosed, and the order that picks
the survivors is a stated rule.

**What happened.** `collectBlockers` ended in `.slice(0, 25)`
(`builder.ts:396`) and `buildRecommendedTasks` broke at 12
(`builder.ts:420`). Neither emitted a limitation, a total, or a "showing N of
M". A repository with 40 high findings read exactly like one with 25, and a
reader who closed all 12 tasks believed the work was done. This is the same
defect class as R-50 — a count that silently omits part of its population — in
the one place the report presents itself as a work list.

**What the fix is.** Both functions return their total alongside their list:
`collectBlockers` → `{ blockers, total }`, `buildRecommendedTasks` →
`{ tasks, fromBlockers }`. The builder passes the four numbers to
`buildLimitations`, which emits a sentence only when something was actually left
out, and generates the counts from the same `MAX_BLOCKERS` / `MAX_TASK_FINDINGS`
constants that do the capping — so the prose cannot drift from the list.

The entry's real objection was that a note would paper over an arbitrary
choice, and it was right: the sort was severity-only, so which 25 of 40
survived was whatever order the analyzers happened to emit. The choice, made
here and stated in the sentence: severity first, then category in the order
security, deployment, reproducibility, documentation, web3, hackathon, then the
finding id. A credential leak outranks a deployment gap; ties below the category
fall through to the id, so the list is a function of the findings and nothing
else. `localeCompare` is deliberately not used for that last step — it reads
the ICU locale, and the point is the same order everywhere.

`builder.test.ts` builds a clean repository (no blockers of its own) plus forty
history findings and asserts the list is 25, the sentence says `top 25 of 40`,
the task sentence says `first 12 of the 25`, and a three-blocker report gets no
note at all. Two more cases pin the ordering — the same 25 when the input is
reversed, security before documentation at equal severity, and a critical
finding still ahead of a high one. Removing the disclosure fails four cases;
reverting to the severity-only sort fails the same four, from the order alone.

## R-70 — Shutdown abandons the jobs the queue already accepted

**Severity:** Low for the shipped topology: production refuses to start with the
inline driver.
**Likelihood:** Certain whenever the inline driver runs with more than one job
queued at SIGTERM.
**Status:** Fixed 2026-10-21 — refusing new work and finishing accepted work
are two decisions, and `stop()` waits for the second.

**What happened.** `InlineAuditQueue.stop()` set `accepting = false`, then
waited on `inFlight`. But `dispatch()`'s `.finally` only continued draining
`pending` when `this.accepting` was still true
(`inline-audit-queue.ts:180`), so from the moment shutdown began, jobs already
accepted and sitting in `pending` were never started. The client already had a
202 and a `statusUrl`; the row stayed `queued` and nothing moved it.

**What the fix is.** `accepting` now means exactly one thing — refuse new
enqueues — and the drain is no longer gated on it. `dispatch()`'s `.finally`
continues whenever `pending` is non-empty, and `stop()` calls `dispatch()` once
on entry so the guarantee does not depend on a worker happening to be running.
`stop()`'s wait was already on `inFlight`, which includes pending jobs; what
was missing was that they would ever start, so the grace period elapsed in
silence. The forced-close log line now names what it abandoned —
`{ abandoned, pending, running }` — instead of one `pending` field that counted
both.

The shutdown contract `verify:release` exercises is unchanged in the direction
that matters: `stop()` still returns within `shutdownGraceMs`, and a job that
outlives it is still abandoned. What changed is that a job with time left now
runs.

`apps/api/src/queue/inline-audit-queue.test.ts` is new — the queue had no direct
test, which is how a shutdown flag with two meanings survived. It enqueues two
jobs behind one worker, calls `stop()` while the second is still queued, and
asserts both ran; a second case asserts the door is shut at the same instant.
Restoring `&& this.accepting` fails the first with `['first']`, and the run
takes the full five-second grace period to get there.

## R-71 — The completed write is the one status transition that is not guarded

**Severity:** Low — last-writer-wins on a terminal state, with no log line.
**Likelihood:** Low: needs two workers on one job, which needs a reclaim.
**Status:** Fixed 2026-10-21 — guarded on `processing`, and a dropped report is
logged with the state it found.

**What happened.** Every other write in `AuditWorker` passed `expectedStatus`:
the claim is guarded on `'queued'`, the failure write on `'processing'`. The
completion write (`audit-worker.ts:216`) passed none, so it landed whatever the
row said by the time it arrived — including over a row another worker had
reclaimed and was processing. Two workers could both write `completed`; the
later one won, and nothing recorded that a write was lost or that two workers
disagreed about who owned the job.

**What the fix is.** The completion write passes `'processing'`. When it reports
`updated: false` the report is dropped — which is correct, because the reclaim
that took the row re-runs the audit and writes its own result — and the worker
logs `audit job completed by a worker that no longer held it; report dropped`
with the row's current status, re-read for that purpose. The entry left this
open as "only correct if the reclaim is guaranteed to produce one", i.e. R-44's
invariant; the reclaim path at the top of `runOnce` requeues and then takes the
row through the normal claim, so it does.

The alternative — leave it unguarded and let the later write win — is worse than
it looks: an unguarded write can flip a row another worker already settled to
`failed` back to `completed`, after the client has been told it failed.

`audit-worker.test.ts` holds the pipeline open, settles the row from outside
while it runs (the state a `staleProcessingMs` reclaim produces), releases it,
and asserts the row is still `failed` with a null report. Removing the
`'processing'` argument turns that into `expected 'completed' to be 'failed'`.

## R-72 — Health reads every audit report on SQLite to count one row

**Severity:** Low.
**Likelihood:** Certain on SQLite once the table is large; the cost grows with
the bytes of every report ever written.
**Status:** Fixed 2026-10-21 — the limit is in the query on both backends.

**What happened.** `JobRepository.list()` on SQLite did
`select().from(jobs).all().slice(-limit)` — every column of every row,
`report_json` included, materialised in memory to answer `list(1)`. The only
caller is the health path, `server.ts:237`. Postgres took the same call as
`.limit(limit)` and paid nothing for the rows, but with no `ORDER BY` it
returned *some* n rows, so the two backends disagreed about what the method
meant.

**What the fix is.** Both branches now ask for `ORDER BY created_at DESC
LIMIT n` (`job-repository.ts:165-181`), which is a backward index scan of n
rows on either backend — `created_at` is indexed on both. The order became part
of the contract and is written down in the docstring, because the previous
order was "insertion order" on SQLite and "whichever rows" on Postgres, and a
caller reading the old code could not have known that.

The ordering question the entry left open — `rowid` versus `createdAt` — was
answered by the caller count: there is exactly one, it asks for one row, and it
is asking whether the table is readable. Newest-first is the useful answer for
a diagnostic, and a tie inside the same millisecond changes which of two
equally-recent rows a *future* caller sees rather than what this one sees.

`apps/api/src/tests/sqlite.integration.test.ts` inserts three jobs with
timestamps in 2099 (so the shared database's other rows cannot crowd them out)
and asserts `list(2)` returns the newest two, newest first. Reverting to
`.all().slice(-limit)` makes that case red on the order alone.

## R-73 — The MCP gate passes on the word tools

**Severity:** Low.
**Likelihood:** Certain: it is what the step did until 2026-10-21.
**Status:** Fixed 2026-10-21 — the step parses the reply and compares it to the
registrations.

**What happened.** The MCP step in `scripts/verify-release.ts` wrote
`initialize`, `notifications/initialized` and `tools/list`, then waited for
`/"tools"\s*:/` in stdout. It never parsed the JSON-RPC response, never checked
the `id`, never counted the tools against the 14 the documentation advertises,
and never issued a `tools/call`. A binary that answered `{"tools": []}` — or an
error object that happened to contain the key — passed.

**What the fix is.** The reply is parsed and identified by the request id the
step sent, then compared to the `server.tool()` registrations re-read from
`packages/mcp-server/src/index.ts`: every declared tool must be listed, nothing
undeclared may be, names must be unique, and every tool must carry a non-empty
description and an object `inputSchema`. `toolsFromResponse`,
`toolSurfaceProblems` and `registeredToolNames` live in `scripts/mcp-tools.ts`
(`:67`, `:91`, `:145`), and the step calls them at
`verify-release.ts:850-855`.

The reason the parse is a module and not ten lines in the gate: a check buried
in a script can only be exercised by starting a server and running thirteen
other steps first, which is why the old one never was. `scripts/mcp-tools-probe.ts`
(`pnpm probe:mcp-tools`) feeds it ten answers — a real reply, an error envelope
that mentions "tools", a reply under the wrong id, a line truncated by the
capture cap, a missing tool, an extra tool, a duplicate name, a tool with no
description, a tool whose schema is not an object, and the declared list itself.
Reverting the parse to `output.includes('"tools"')` turns eight of the ten red,
including the three that the old check passed.

One number moved with it: `child-wait.ts`'s capture cap was 20 KB and the real
`tools/list` payload is 10 824 characters, so a well-written tool description
would have truncated the line and turned a working server into a parse failure.
The cap is 64 KB now, and the failure *message* stays bounded separately by
`MAX_REPORTED_LINE`.

## R-74 — The free check guesses main, and a test pins the guess

**Severity:** Low — a free-tier result that says "not found" about a repository
that exists.
**Likelihood:** Low per repository, certain per `master`-default repository
audited while the metadata call fails.
**Status:** Fixed 2026-10-21 — the fallback ref is `HEAD`.

**What happened.** `free-check.ts:296` fetched the tree at
`metadata?.defaultBranch ?? 'main'`. Metadata failure is explicitly non-fatal
(step 2 catches it and continues), so the tolerated case was precisely the one
that guessed. On a repository defaulted to `master`, `develop` or `trunk` the
tree request 404s and the free check reported the repository as unreachable.
`free-check.test.ts:209` asserted `askedRefs` equals `['main']` for exactly this
input, so the defect was pinned as expected behaviour — the same pattern as
SURF-8's entry in the assessment, and the reason a test that documents a guess
is worse than no test.

**What the fix is.** The fallback is `'HEAD'`, which is the default branch by
definition, so it costs the same single request the tier already budgets for —
the constraint the entry named as the reason to wait. Measured 2026-10-21
before changing anything:
`GET /repos/octocat/Hello-World/git/trees/HEAD` → `200` with a tree, while
`/git/trees/main` → `404` on a `master`-default repository.

The test now asserts `['HEAD']`, and its name says why: the old case was
"falls back to main when the metadata carries no branch", which is a statement
about the implementation wearing the clothes of a specification. Both of the
alternatives the entry listed — retrying `metadata()`, or a second tree request
against the branch the 404 named — cost an extra request. This one costs none.


## R-75 — An enqueue failure writes a terminal state and the driver's own error text

**Severity:** Medium for recovery, Low for disclosure — the 503 tells the client
to retry, and the write made the retry a no-op.
**Likelihood:** Certain whenever the queue refuses a job at shutdown; the
inline driver refuses for the whole drain window.
**Status:** Fixed 2026-10-21 — the row stays `queued` and the message goes to
the log.

**What happened.** `POST /api/v1/audits` reached its last step, called
`deps.queue.enqueue`, and on the throw did
`service.fail(job, 'ENQUEUE_FAILED', msg)` before answering 503
(`audits.ts:438` until 2026-10-21). Two defects in one statement, and they
compounded:

- **`failed` is terminal, and the worker claims on `expectedStatus: 'queued'`.**
  The client did what the 503 said — replayed the same POST with the same
  `Idempotency-Key` and the same `X-PAYMENT` — found the row it had just
  created, attached the payment to it, enqueued it, got a 202, and the job
  could never be claimed. The one recovery the response named was the one the
  write had made impossible. The inline driver had already decided this
  question for the same situation in `runJob`'s comment: a job that never
  reached the worker stays `queued`, "which is true".
- **`msg` was the driver's own error text.** pg-boss throws its library's
  error, which names the database host and port. `GET /api/v1/audits/:jobId`
  serves that column verbatim as `error.message` — R-65's disclosure, through
  the other door. R-65 closed the worker's path; this one had no vocabulary to
  close it with, because `ENQUEUE_FAILED` is not an `AuditErrorCode` and
  `publicErrorMessage` cannot serve a code it does not know.

**What the fix is.** No write at all, and a `warn` line keyed by `jobId`
carrying the thrown message (`audits.ts:452-464`). Nothing is disclosed because
nothing is stored, and `queued` is both true and claimable — so the retry the
503 asks for now works.

Not writing `failed` does mean a client that ignores the 503 and polls gets
202 forever. That is the narrower failure: the response told it to retry the
POST, and the POST is the only thing that can revive the job. A `failed` row
was terminal for every client, including the compliant one.

The path was previously untestable, which is why it stayed: `buildApp`
constructs the queue itself, so the only way to make `enqueue` throw was to
race a real shutdown against a real request. `AppDeps` now takes an optional
`queue` override (`server.ts:50-59`), and
`apps/api/src/tests/enqueue-failure.test.ts` injects one that throws
`connect ECONNREFUSED 10.0.0.5:5432` — a string shaped like the real thing —
then asserts the 503 body and the polled row contain neither the host nor the
port, and that the row is `queued`. Restoring the `service.fail` line turns
that case red on `expected 'failed' to be 'queued'`.

## R-76 — /health calls a queue that never started ok, and gives two states one number

**Severity:** Low — observability only; nothing acts on these numbers
automatically.
**Likelihood:** Certain before `start()`; certain whenever a backlog exists.
**Status:** Fixed 2026-10-21 — not-started is `unavailable`, and `active`
splits `pending`.

**What happened.** `InlineAuditQueue.health()` derived its status from
`this.accepting`, which is initialised `true` and only cleared by `stop()`.
So a queue that had never been started — or a process that never starts one —
answered `status: 'ok'`, `acceptingJobs: true` with no workers behind it. The
pg-boss driver answers `unavailable` for that same state, so the two drivers
disagreed about a queue in the same condition. `buildApp` always starts the
queue before serving, which is why this never surfaced: the wrong answer was
only reachable in states the shipped topology does not enter.

The second half is a naming defect with an operational cost. `pending` was
`inFlight.size` — every accepted-and-unfinished job, the running one included —
while pg-boss summed `queuedCount + activeCount`, the same quantity. Both
drivers agreed; the field name said "waiting". An operator reading
`pending: 5` on a one-worker deployment could not tell a backlog of five from
one job running and four waiting, which is the difference between "busy" and
"stuck".

**What the fix is.** `health()` returns `unavailable` / `acceptingJobs: false`
when `started` is false, mirroring pg-boss (`inline-audit-queue.ts:168-188`).
`QueueHealth.pending` is documented as outstanding work rather than waiting
work (`audit-queue.ts:42-61`), and a new optional `active` carries the running
part on both drivers (`inline-audit-queue.ts:186`,
`pg-boss-audit-queue.ts:201`), through the zod schema and the OpenAPI document.
`pending - active` is the queue depth.

`inline-audit-queue.test.ts` pins both: a queue that never started is
`unavailable` with no counts, and one worker holding `first` while `second`
waits reports `{ pending: 2, active: 1 }`. Removing the `started` guard fails
the first; dropping `active` fails the second.

## R-77 — A queued job has no deadline, and only a re-enqueue can move it

**Severity:** Low for money, Medium for trust — the row is the only record that
the work was accepted, and it never resolves.
**Likelihood:** Narrow: the enqueue has to fail after the row exists, or the
inline driver has to die holding a backlog.
**Status:** Accepted residual — a sweep needs a threshold the row cannot justify
on its own, and the two drivers cannot justify it from the same place.

**What happens.** `AuditWorker.runOnce` ages exactly one state. A row parked in
`processing` past `staleProcessingMs` is reclaimed (`audit-worker.ts:192-224`),
because a crashed attempt is otherwise a dead end. A row in `queued` is never
looked at: the claim is `expectedStatus: 'queued'`, so anything that picks the
row up moves it forward, and nothing that fails to pick it up can see that it
should have.

Three ways a job ends up `queued` with nothing behind it:

- **The enqueue throws.** Since R-75 the row is deliberately left `queued`
  (`audits.ts:452-464`) — that is what makes the retry the 503 asks for work.
  The payment was verified earlier in the same request, so by this point the
  buyer has paid and the row is the receipt for it.
- **The process dies between the insert and the enqueue.** The row exists, no
  queue entry does, and the client never got a response to retry.
- **The inline driver is killed with a backlog.** `pending` is a `string[]` in
  memory (`inline-audit-queue.ts:80`); R-70 made a graceful `stop()` drain it,
  and nothing survives SIGKILL.

`GET /api/v1/audits/:jobId` answers `status: "queued"` in all three, with no
deadline and nothing to distinguish it from a job that is one poll away from
running. The client's `pollAfterMs` keeps it polling a row that will not move.

**Why it is accepted rather than fixed.** Every version of the fix needs a
decision the code cannot make for itself:

- **A reaper that writes `failed`** needs a threshold, and the evidence that a
  job will never run lives in the *queue*, not in the row. pg-boss's `job` table
  and the inline driver's in-memory array are different systems, and an old row
  may be sitting in a paused pg-boss queue that drains on Monday. A threshold
  picked from `created_at` alone would fail work that was about to run.
- **Re-enqueueing from the read path** turns `GET` into a write that any poller
  can trigger, which is how a status endpoint becomes a way to run a paid audit
  for free.
- **A deadline stated in the response** would be a promise about the queue that
  the API cannot keep, which is R-28's shape: a signal that reads as a
  capability the service does not have.

What bounds the cost today is the topology. Production runs pg-boss, which is
durable and retries; `config.ts:186-190` refuses `AUDIT_QUEUE_DRIVER=inline`
under `NODE_ENV=production` (R-16). The window left is the enqueue throw, and
there the client was told, in the same response — 503, `Retry-After: 1` — to
POST again, and that POST is the only thing that can revive the row.
**Trigger:** the first refund request for a paid audit whose job never started.
The answer at that point is a `queuedAt` column and a sweep with a stated
threshold; it is worth building with a real complaint in hand rather than
guessing the threshold now.

## R-78 — The MCP server's HTTP transport is unauthenticated by design

**Severity:** Medium — a paid tool reachable by anything that can route to the
port, and no credential between the two.
**Likelihood:** Certain for any deployment that sets `REPOPILOT_MCP_HOST` to a
routable address; zero for the default, which is loopback.
**Status:** Mitigated by design — the bind address and the payment mode are the
mitigations, and both are enforced at startup rather than documented.

**What happens.** `REPOPILOT_MCP_TRANSPORT=http` makes the MCP server answer on
a socket (`POST /mcp`, `GET /mcp`, `DELETE /mcp`) instead of stdio. The endpoint
has no authentication: no API key, no token, no origin check. `audit_github_repository`
and `reaudit_repository` are reachable by any client that can complete an MCP
handshake, and in `PAYMENT_MODE=mock` they auto-verify their own challenge — so
the pipeline runs for free, with no log line, for anyone who can reach the port.

This is the same shape as the HTTP API, which is also unauthenticated and also
paid. The difference is that the API's exposure is a deliberate deployment
decision made in a Dockerfile, and the MCP server's is a one-variable change
(`REPOPILOT_MCP_HOST`) that reads like a networking setting.

**What the mitigation is.** `assertBindable()` (`packages/mcp-server/src/http.ts`)
refuses to open a socket on a non-loopback address while the payment mode is
`mock`, and the process exits 1 with the two ways out named. The default host is
`127.0.0.1`, so the exposed configuration has to be asked for twice: once by
choosing a routable host, once by choosing the real payment rail. The transport
itself is opt-in (`REPOPILOT_MCP_TRANSPORT`, default `stdio`), so an upgrade
cannot expose a server that was not exposed before.

A routable bind with `PAYMENT_MODE=okx` is allowed, and there the gate is the
payment handshake: every paid tool mints a challenge the caller has to settle.
That is a real gate, not a decorative one, but it is the *only* one — an
attacker with a funded wallet can run audits, and the server will not know who
they are.

**What it does not cover.**

- **Denial of service.** The session cap (64) and the 1 MB body cap bound the
  damage, and nothing rate-limits the endpoint. An unauthenticated client can
  hold 64 sessions open until the idle sweep reclaims them.
- **The free tools' network cost.** `free_check` and the four intelligence tools
  fetch from GitHub. They are free by design (D-019) and they are also free to
  abuse: a public endpoint turns the server into an anonymous GitHub proxy for
  any repository `ALLOWED_REPO_HOSTS` permits.
- **TLS.** The server speaks plain HTTP. A routable deployment is expected to
  put a proxy in front of it, and nothing in the process says so.

**Detection.** `GET /health` reports `paymentMode`, `sessions` and `maxSessions`
— enough to see a routable deployment that is also running mock, which is the
one combination `assertBindable` refuses. Anything past that is a proxy's access
log, not this process's.

**Related.** D-045 (the decision), R-02 (the same failure mode on the API),
D-019 (why the free tools are free).

---

## R-79 — The published contract was a second copy, and nothing read it

**Severity:** High while it lasted — the document external clients code against
described bodies the server never sends.
**Likelihood:** Certain, in the sense that it had already happened twice.
**Status:** Fixed 2026-10-22 — one copy instead of two, and a gate on the one
that remains.

**What happened.** `apps/api/src/openapi.ts` carried `components.schemas` as a
hand-written JSON literal beside the routes. Nothing tested it — there was no
test that read the document at all — so the copy drifted, twice, in ways a
client would act on:

- `CapabilitiesResponse.endpoints` declared `{auth, input, output, rateLimited,
  pricingUsdt}` for each endpoint. The route has emitted
  `{method, path, description, requiresPayment}` from the day it was written,
  and it also emits a `cache` block the document did not mention. Four of the
  five fields a generated client would look for do not exist, and one field the
  server always sends was invisible.
- `CreateAuditRequest.mode` declared `default: 'quick'`. R-37 changed the
  default to `full` in `CreateAuditInputSchema` on 2026-10-05 — the one-price
  decision, where a caller who omitted the field had to get the report the
  service description promised — and the change did not reach the document. The
  contract described the field backwards to exactly the buyer who relied on it.

The document also declared `openapi: '3.1.0'` and used `nullable: true`
throughout, which is 3.0 syntax: a strict validator rejects it, and a lenient one
reads the keyword as unknown and leaves the field required and non-null. And six
operations carried a `derived` tag that the document's `tags` array never
introduced.

**Why nothing caught it.** `paths` being hand-written is a decision (D-046), and
it is a good one — which is why the defect sat in the half that had no reason to
be. `components.schemas` was a *copy* of structures that already existed in Zod,
and a copy has no link to its original. The routes validated with
`FreeCheckInputSchema` and parsed responses through `CapabilitiesSchema`; the
document restated both by hand. That is the same defect class the 2026-10-01
review found fourteen of in prose, in a file that happens to be JSON.

**What the fix is.** The schemas are generated (`apps/api/src/openapi-schemas.ts`
→ `buildOpenApiSpec()`), so there is one definition and the document is a
rendering of it. `paths` stays hand-written. Four gates:

- `apps/api/src/openapi.test.ts` — every route the app registers is documented
  and every documented operation is served (collected through Fastify's
  `onRoute` hook, so a route written in any style is visible); every `$ref`
  resolves; every component is referenced; every tag is declared; no 3.0-only
  keyword survives; no response object is closed.
- `apps/api/src/tests/api.integration.test.ts` — real 402 / 202 / 200 bodies,
  parsed through the published schemas, so the document cannot describe a body
  the server does not send.
- `pnpm openapi:check` — rebuilds the document and byte-compares it with the
  committed `docs/openapi.json`; runs in CI beside `docs:check`.
- `docs/API.md` describes how the two halves are built and what the gates check.

**Verification.** Five mutations, each caught: a path removed from `paths`
(coverage + unused-component tests red), an `additionalProperties: false`
reintroduced, `nullable: true` reintroduced, a component nothing references
added, and a tag renamed in `tags` only. The two client-visible defects are
now impossible rather than fixed: the capabilities block and the `mode` default
are read from the schema that emits them.

**Related.** D-046 (the decision and the rejected alternatives), R-31 (the
exemption list that would have been needed without `routes/meta.ts`), R-37 (the
`mode` default), D-031 (the same fix for prose facts).

## R-80 — A collector that is down looks exactly like tracing that is off

**Severity:** Low — no audit fails, no client is affected, and the service keeps
serving.
**Likelihood:** Certain in one direction: a deployment that turns tracing on
and points it at a collector which is later moved, renamed, or firewalled
produces no spans and no error line.
**Status:** Accepted residual — the mitigations below are real, and the silent
case is not closed: the SDK's export path has no hook that reaches this
process's logger.

**What happens.** `BatchSpanProcessor` exports on a timer and, when the export
fails, reports the failure through `@opentelemetry/api`'s `diag` channel. That
channel is a no-op until a logger is installed with `diag.setLogger`, which
this service does not do. So the observable states are:

| Configuration | Collector | What the operator sees |
| --- | --- | --- |
| `none` | — | nothing, by design |
| `otlp` | up | spans in the collector |
| `otlp` | down / wrong URL / TLS failure | nothing, and no log line |

The third row is the risk. It is the same shape as R-79's "nothing read the
document": a feature that is configured, believed to be working, and silently
not.

**Why it is not fixed here.** Installing a `diag` logger means choosing what
its messages look like in pino (the SDK emits unstructured strings at four
levels, including one per dropped span), and the batch processor's retry
behaviour means a down collector would produce a warning every five seconds
for as long as it stays down. That is a logging-policy decision, not a tracing
one, and it is not what the backlog item asked for.

**Mitigations that are in place.**

- **The endpoint is validated at startup.** `OTEL_TRACES_EXPORTER=otlp` with
  an empty endpoint is a config error, not a fallback to `localhost:4318` —
  the exporter's own default, which would make a typo look like a working
  configuration.
- **The signal path is appended, and tested on a socket.**
  `telemetry.otlp.test.ts` starts an HTTP server, points a real
  `OTLPTraceExporter` at it, and asserts the POST lands on `/v1/traces` with
  the span in the body. A wrong URL shape fails a test rather than an
  investigation.
- **The collector is the place to watch.** Any collector worth running
  exposes "spans received"; a deployment that cares about traces should alert
  on that counter being zero while traffic is non-zero.

**What would close it.** A `diag` adapter that routes SDK diagnostics through
pino at `warn`, rate-limited to one line a minute per message, plus a startup
line naming the exporter and endpoint. Both are cheap; neither is in this
change.
