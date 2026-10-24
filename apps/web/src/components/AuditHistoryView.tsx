import { Fragment, useEffect, useState } from 'react';
import { listRepoAudits, type AuditHistory } from '../lib/api.js';
import { scoreClass, shortSha, when } from '../lib/format.js';
import { useI18n } from '../i18n.js';

export function AuditHistoryView({
  owner,
  repo,
  currentJobId,
  onCompare,
}: {
  owner: string;
  repo: string;
  currentJobId: string | null;
  onCompare: (baseJobId: string) => void;
}) {
  const { t } = useI18n();
  const [history, setHistory] = useState<AuditHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * The failed row whose reason is open. One at a time: a history with ten
   * failures and every reason expanded is a wall of text, and the question is
   * always about one of them.
   */
  const [openFailure, setOpenFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const next = await listRepoAudits(owner, repo);
        if (!cancelled) {
          setHistory(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  return (
    <section>
      {/*
        Every view carries exactly one h1 for its own subject. Before this,
        the app's only h1 was the marketing headline in the hero, and the
        hero is now collapsed once a report exists — which would have left
        this view with no page heading at all. Here the subject is the repo,
        same as the report view.
      */}
      <p className="report-kind">{t.historyTitle}</p>
      <h1 className="report-title">{owner}/{repo}</h1>
      <p className="meta" style={{ marginTop: 4 }}>
        {t.historyHint}
      </p>

      {loading && (
        <div className="card">
          <div className="skeleton" aria-hidden="true">
            <div className="skeleton-line" style={{ width: '70%' }} />
            <div className="skeleton-line" style={{ width: '52%' }} />
          </div>
        </div>
      )}

      {error && <div className="empty">{error}</div>}

      {!loading && history && history.count === 0 && <div className="empty">{t.historyEmpty}</div>}

      {!loading && history && history.count > 0 && (
        <div className="card tight">
          <table className="diff-table">
            <thead>
              <tr>
                <th>{t.historyWhen}</th>
                <th>{t.historyCommit}</th>
                <th>{t.historyMode}</th>
                <th>{t.historyScore}</th>
                <th>{t.historyFindings}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.audits.map((entry) => {
                const isCurrent = entry.jobId === currentJobId;
                const comparable = entry.status === 'completed' && entry.overall !== null && !isCurrent;
                const failed = entry.status === 'failed';
                const open = failed && openFailure === entry.jobId;
                return (
                  <Fragment key={entry.jobId}>
                    <tr>
                      <td>{when(entry.createdAt)}</td>
                      <td><code>{shortSha(entry.commitSha)}</code></td>
                      <td className="meta">{entry.mode} · {entry.target}</td>
                      <td className="num">
                        {entry.overall === null ? (
                          <span className="meta">—</span>
                        ) : (
                          <span className={`pill ${scoreClass(entry.overall)}`}>{entry.overall}</span>
                        )}
                      </td>
                      <td className="num">{entry.findingCount ?? '—'}</td>
                      <td>
                        {isCurrent ? (
                          <span className="meta">{t.historyCurrent}</span>
                        ) : comparable ? (
                          <button className="secondary" onClick={() => onCompare(entry.jobId)}>
                            {t.historyCompare}
                          </button>
                        ) : failed ? (
                          /*
                           * A failed audit is the one row that has something
                           * more to say, and the reason is already in the
                           * summary. The pill is the toggle: `errorCode` is
                           * the classification, which is short enough to sit
                           * in the column, and the sentence opens below.
                           */
                          <button
                            type="button"
                            className="pill bad"
                            aria-expanded={open}
                            title={entry.error ?? undefined}
                            onClick={() => setOpenFailure(open ? null : entry.jobId)}
                          >
                            {entry.errorCode ?? entry.status}
                          </button>
                        ) : (
                          <span className="meta">{entry.status}</span>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr className="failure-row">
                        <td colSpan={6}>
                          <span className="meta">{t.historyFailure}: </span>
                          {entry.error ?? '—'}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
