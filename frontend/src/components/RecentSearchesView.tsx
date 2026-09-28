import { useCallback, useEffect, useState } from 'react';
import { fetchSearchHistory } from '../api/search';
import type { SearchFilters, SearchHistoryItem } from '../api/search';
import { enrichExecution, getExecutionResults } from '../api/executions';
import type { ExecutionResultItem } from '../api/executions';
import { CATEGORY_LABELS, ENRICHMENT_STATUS_LABELS, GOVERNORATE_LABELS, JOB_STATUS_LABELS } from '../api/search-options';
import { IconGlobe, IconHistory, IconRefresh } from './icons';

interface Props {
  onRerun: (query: string, filters: SearchFilters) => void;
  onStartSearch: () => void;
}

function statusClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'badge badge-verified';
    case 'FAILED':
      return 'badge badge-unverified';
    default:
      return 'badge badge-neutral';
  }
}

function filterChips(filters: SearchFilters): string[] {
  const chips: string[] = [];
  if (filters.governorate !== undefined) {
    chips.push(GOVERNORATE_LABELS[filters.governorate] ?? filters.governorate);
  }
  if (filters.category !== undefined) {
    chips.push(CATEGORY_LABELS[filters.category] ?? filters.category);
  }
  if (filters.minRating !== undefined) {
    chips.push(`تقييم ${filters.minRating}+`);
  }
  if (filters.verifiedOnly === true) {
    chips.push('موثّق فقط');
  }
  return chips;
}

export default function RecentSearchesView({ onRerun, onStartSearch }: Props) {
  const [items, setItems] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [executionResults, setExecutionResults] = useState<ExecutionResultItem[]>([]);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSearchHistory();
      setItems(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء تحميل السجل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleViewExecution(executionId: string) {
    if (selectedExecutionId === executionId) {
      setSelectedExecutionId(null);
      setExecutionResults([]);
      return;
    }
    setSelectedExecutionId(executionId);
    setExecutionLoading(true);
    try {
      const response = await getExecutionResults(executionId);
      setExecutionResults(response.data);
    } catch {
      setExecutionResults([]);
    } finally {
      setExecutionLoading(false);
    }
  }

  async function handleEnrichHistory(executionId: string) {
    setEnrichingId(executionId);
    try {
      await enrichExecution(executionId);
      const response = await getExecutionResults(executionId);
      setExecutionResults(response.data);
    } catch {
      // silent
    } finally {
      setEnrichingId(null);
    }
  }

  return (
    <div className="view">
      <header className="view-header">
        <h1>عمليات البحث</h1>
        <p>أحدث عمليات البحث التي نفذتها، ويمكنك إعادة تشغيل أي منها بنقرة واحدة.</p>
      </header>

      {loading && (
        <div className="skeleton-results" aria-label="جارٍ التحميل…">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton-row" />
          ))}
        </div>
      )}

      {error !== null && (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button type="button" className="link-btn" onClick={() => void load()}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {!loading && error === null && items.length === 0 && (
        <div className="notice empty">
          <p>لا توجد عمليات بحث سابقة بعد.</p>
          <button type="button" className="link-btn" onClick={onStartSearch}>
            ابدأ بحثك الأول
          </button>
        </div>
      )}

      {!loading && error === null && items.length > 0 && (
        <section className="history-list" aria-label="سجل عمليات البحث">
          {items.map((item) => {
            const chips = filterChips(item.filters);
            return (
              <article key={item.id} className="history-card">
                <div className="history-card-main">
                  <div className="history-card-title">
                    <IconHistory width={18} height={18} />
                    <h2>{item.query}</h2>
                  </div>
                  {chips.length > 0 && (
                    <div className="chip-row">
                      {chips.map((chip) => (
                        <span key={chip} className="chip static">
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="history-card-meta">
                    <span className={statusClass(item.status)}>{JOB_STATUS_LABELS[item.status] ?? item.status}</span>
                    <span>
                      <strong>{item.resultCount}</strong> نتيجة
                    </span>
                    <span>{new Date(item.createdAt).toLocaleString('ar-EG')}</span>
                  </div>
                </div>
                <div className="history-card-actions">
                  {item.executionId !== null && (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        disabled={enrichingId === item.executionId}
                        onClick={() => void handleEnrichHistory(item.executionId!)}
                      >
                        <IconGlobe width={16} height={16} />
                        {enrichingId === item.executionId ? 'جارٍ الإثراء…' : 'إثراء'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void handleViewExecution(item.executionId!)}
                      >
                        {selectedExecutionId === item.executionId ? 'إخفاء' : 'عرض النتائج'}
                      </button>
                    </>
                  )}
                  <button type="button" className="secondary" onClick={() => onRerun(item.query, item.filters)}>
                    <IconRefresh width={16} height={16} />
                    إعادة البحث
                  </button>
                </div>
                {selectedExecutionId === item.executionId && (
                  <div className="history-execution-detail">
                    {executionLoading ? (
                      <div className="skeleton-results" aria-label="جارٍ تحميل النتائج…">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="skeleton-row" style={{ height: 48 }} />
                        ))}
                      </div>
                    ) : executionResults.length === 0 ? (
                      <p className="muted">لا توجد نتائج لهذه العملية.</p>
                    ) : (
                      <div className="history-results-list">
                        {executionResults.map((r) => (
                          <div key={r.resultId} className="history-result-row">
                            <span className="history-result-name">{r.companyName}</span>
                            {r.enrichment !== null && (
                              <span className={`badge badge-enrichment badge-enrichment-${r.enrichment.status.toLowerCase()}`}>
                                {ENRICHMENT_STATUS_LABELS[r.enrichment.status] ?? r.enrichment.status}
                              </span>
                            )}
                            {r.enrichment?.website !== null && r.enrichment?.website !== undefined && (
                              <span className="muted" dir="ltr">{r.enrichment.website.title}</span>
                            )}
                            {r.enrichment?.social !== null && r.enrichment?.social !== undefined && r.enrichment.social.profiles.length > 0 && (
                              <span className="muted">{r.enrichment.social.profiles.length} حساب</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
