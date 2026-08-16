import { useState } from 'react';
import type { LeadStatus, SavedLead } from '../api/leads';
import { savedLeadToResult } from '../api/leads';
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
  onStartSearch,
}: Props) {
  const [filter, setFilter] = useState<string>(ALL);

  const filtered = filter === ALL ? leads : leads.filter((lead) => lead.status === filter);

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
              <LeadCard
                key={lead.id}
                result={savedLeadToResult(lead)}
                savedLead={lead}
                onOpen={() => onOpen(lead)}
                onStatusChange={(status) => void onStatusChange(lead.id, status)}
                onRemove={() => onRemove(lead.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
