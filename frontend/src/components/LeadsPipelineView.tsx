import type { SavedLead } from '../api/leads';
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from '../api/search-options';
import { IconGlobe, IconStar } from './icons';

interface Props {
  leads: SavedLead[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (lead: SavedLead) => void;
  onStartSearch: () => void;
}

function statusColumnClass(status: string): string {
  switch (status) {
    case 'NEW':
      return 'pipeline-col pipeline-new';
    case 'REVIEWED':
      return 'pipeline-col pipeline-reviewed';
    case 'CONTACTED':
      return 'pipeline-col pipeline-contacted';
    case 'QUALIFIED':
      return 'pipeline-col pipeline-qualified';
    default:
      return 'pipeline-col pipeline-disqualified';
  }
}

export default function LeadsPipelineView({ leads, loading, error, onRetry, onOpen, onStartSearch }: Props) {
  const total = LEAD_STATUSES.reduce((sum, status) => sum + leads.filter((lead) => lead.status === status).length, 0);

  return (
    <div className="view">
      <header className="view-header">
        <h1>العملاء المحتملين</h1>
        <p>تابع مسار كل عميل محتمل عبر مراحل المبيعات: من جديد حتى مؤهل أو غير مؤهل.</p>
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
          <button type="button" className="link-btn" onClick={onRetry}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {!loading && error === null && leads.length === 0 && (
        <div className="notice empty">
          <p>لا يوجد عملاء محتملون بعد. احفظ نتائج البحث لتظهر هنا في مسار المبيعات.</p>
          <button type="button" className="link-btn" onClick={onStartSearch}>
            ابدأ بحثًا جديدًا
          </button>
        </div>
      )}

      {!loading && error === null && leads.length > 0 && (
        <section className="pipeline" aria-label="مسار العملاء المحتملين">
          {LEAD_STATUSES.map((status) => {
            const columnLeads = leads.filter((lead) => lead.status === status);
            return (
              <div key={status} className={statusColumnClass(status)}>
                <header className="pipeline-col-head">
                  <span className="pipeline-dot" />
                  <h2>{LEAD_STATUS_LABELS[status]}</h2>
                  <span className="pipeline-count">{columnLeads.length}</span>
                </header>
                <div className="pipeline-col-body">
                  {columnLeads.length === 0 ? (
                    <p className="pipeline-empty">لا يوجد عملاء في هذه المرحلة.</p>
                  ) : (
                    columnLeads.map((lead) => (
                      <button key={lead.id} type="button" className="pipeline-card" onClick={() => onOpen(lead)}>
                        <strong className="pipeline-card-name">{lead.companyName}</strong>
                        {lead.area !== null && <span className="pipeline-card-area">{lead.area}</span>}
                        <span className="pipeline-card-meta">
                          {lead.enrichment !== null && lead.enrichment !== undefined && (
                            <span className="pipeline-enrichment-indicator" title={`الإثراء: ${lead.enrichment.status}`}>
                              <IconGlobe width={11} height={11} />
                            </span>
                          )}
                          {lead.rating !== null && (
                            <span className="rating">
                              <IconStar width={12} height={12} />
                              {lead.rating.toFixed(1)}
                            </span>
                          )}
                          <span className="muted">{new Date(lead.savedAt).toLocaleDateString('ar-EG')}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
          <div className="pipeline-summary">
            <span>
              إجمالي العملاء المحتملين: <strong>{total}</strong>
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
