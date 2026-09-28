import { useState } from 'react';
import type { LeadStatus, SavedLead } from '../api/leads';
import { savedLeadToResult } from '../api/leads';
import { enrichLead } from '../api/enrichment';
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from '../api/search-options';
import LeadCard from './LeadCard';

interface Props {
  leads: SavedLead[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (lead: SavedLead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onRemove: (id: string) => Promise<void>;
  onEnriched: (id: string, enrichment: SavedLead['enrichment']) => void;
  onStartSearch: () => void;
}

const ALL = 'ALL';

export default function SavedLeadsView({
  leads,
  loading,
  error,
  onRetry,
  onOpen,
  onStatusChange,
  onRemove,
  onEnriched,
  onStartSearch,
}: Props) {
  const [filter, setFilter] = useState<string>(ALL);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());

  const filtered = filter === ALL ? leads : leads.filter((lead) => lead.status === filter);

  async function handleEnrich(leadId: string) {
    setEnrichingIds((prev) => new Set(prev).add(leadId));
    try {
      const response = await enrichLead(leadId);
      onEnriched(leadId, response.enrichment);
    } catch {
      // enrichment error is silent in list view
    } finally {
      setEnrichingIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  }

  return (
    <div className="view">
      <header className="view-header">
        <h1>النتائج المحفوظة</h1>
        <p>الأنشطة التجارية التي حفظتها، مع إمكانية تغيير حالتها وإضافة ملاحظاتك في أي وقت.</p>
      </header>

      {!loading && error === null && leads.length > 0 && (
        <div className="chip-row filter-row-chips" role="group" aria-label="تصفية حسب الحالة">
          <button type="button" className={filter === ALL ? 'chip chip-active' : 'chip'} onClick={() => setFilter(ALL)}>
            الكل ({leads.length})
          </button>
          {LEAD_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={filter === status ? 'chip chip-active' : 'chip'}
              onClick={() => setFilter(status)}
            >
              {LEAD_STATUS_LABELS[status]} ({leads.filter((lead) => lead.status === status).length})
            </button>
          ))}
        </div>
      )}

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
          <button type="button" className="link-btn" onClick={onRetry}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {!loading && error === null && leads.length === 0 && (
        <div className="notice empty">
          <p>لم تحفظ أي نتائج بعد. ابحث عن الأنشطة التجارية واحفظها لتظهر هنا.</p>
          <button type="button" className="link-btn" onClick={onStartSearch}>
            ابدأ بحثًا جديدًا
          </button>
        </div>
      )}

      {!loading && error === null && leads.length > 0 && filtered.length === 0 && (
        <div className="notice empty">
          <p>لا توجد نتائج محفوظة بهذه الحالة.</p>
          <button type="button" className="link-btn" onClick={() => setFilter(ALL)}>
            عرض الكل
          </button>
        </div>
      )}

      {!loading && error === null && filtered.length > 0 && (
        <section className="results-section" aria-label="النتائج المحفوظة">
          <div className="results-meta">
            <span>
              <strong>{filtered.length}</strong> من {leads.length} نتيجة
            </span>
          </div>
          <div className="lead-grid">
            {filtered.map((lead) => (
              <div key={lead.id} className="lead-card-wrap">
                <LeadCard
                  result={savedLeadToResult(lead)}
                  enrichment={lead.enrichment}
                  savedLead={lead}
                  onOpen={() => onOpen(lead)}
                  onStatusChange={(status) => void onStatusChange(lead.id, status)}
                  onRemove={() => onRemove(lead.id)}
                />
                <button
                  type="button"
                  className="link-btn enrich-lead-btn"
                  disabled={enrichingIds.has(lead.id)}
                  onClick={() => void handleEnrich(lead.id)}
                >
                  {enrichingIds.has(lead.id) ? 'جارٍ الإثراء…' : 'إثراء'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
