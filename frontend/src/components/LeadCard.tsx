import { useState } from 'react';
import type { LeadStatus, SavedLead } from '../api/leads';
import type { SearchResult } from '../api/search';
import {
  CATEGORY_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  PROVIDER_LABELS,
  VERIFICATION_LABELS,
} from '../api/search-options';
import { IconBookmark, IconGlobe, IconNote, IconPhone, IconPin, IconStar, IconTrash } from './icons';

interface Props {
  result: SearchResult;
  savedLead?: SavedLead | null;
  onSave?: () => Promise<void>;
  onOpen: () => void;
  onStatusChange?: (status: LeadStatus) => void;
  onRemove?: () => void;
}

function verificationClass(status: string): string {
  switch (status) {
    case 'VERIFIED':
      return 'badge badge-verified';
    case 'UNVERIFIED':
      return 'badge badge-unverified';
    default:
      return 'badge badge-unknown';
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'NEW':
      return 'badge status-new';
    case 'REVIEWED':
      return 'badge status-reviewed';
    case 'CONTACTED':
      return 'badge status-contacted';
    case 'QUALIFIED':
      return 'badge status-qualified';
    default:
      return 'badge status-disqualified';
  }
}

export default function LeadCard({ result, savedLead = null, onSave, onOpen, onStatusChange, onRemove }: Props) {
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function handleSave() {
    if (onSave === undefined) {
      return;
    }
    setSaving(true);
    setSavingError(null);
    try {
      await onSave();
    } catch (err) {
      setSavingError(err instanceof Error ? err.message : 'فشل حفظ العميل المحتمل');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (onRemove === undefined) {
      return;
    }
    setRemoving(true);
    try {
      await onRemove();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <article className="lead-card">
      <div className="lead-card-head">
        <div className="lead-card-title">
          <h3>{result.companyName}</h3>
          <div className="lead-card-badges">
            {result.category !== null && (
              <span className="badge badge-neutral">{CATEGORY_LABELS[result.category] ?? result.category}</span>
            )}
            <span className={verificationClass(result.verificationStatus)}>
              {VERIFICATION_LABELS[result.verificationStatus]}
            </span>
            {savedLead !== null && (
              <span className={statusClass(savedLead.status)}>{LEAD_STATUS_LABELS[savedLead.status]}</span>
            )}
          </div>
        </div>
        {result.rating !== null && (
          <span className="lead-card-rating" title={`${result.ratingCount ?? 0} تقييم`}>
            <IconStar width={14} height={14} />
            <strong>{result.rating.toFixed(1)}</strong>
            {result.ratingCount !== null && <span className="muted">({result.ratingCount})</span>}
          </span>
        )}
      </div>

      <div className="lead-card-meta">
        {result.area !== null && (
          <span className="lead-card-meta-item">
            <IconPin width={14} height={14} />
            {result.area}
          </span>
        )}
        {result.address !== null && <span className="lead-card-meta-item lead-card-address">{result.address}</span>}
      </div>

      <div className="lead-card-contact">
        {result.phone !== null && (
          <a className="cell-link with-icon" href={`tel:${result.phone}`} dir="ltr">
            <IconPhone width={14} height={14} />
            {result.phone}
          </a>
        )}
        {result.website !== null && (
          <a className="cell-link with-icon" href={result.website} target="_blank" rel="noreferrer" dir="ltr">
            <IconGlobe width={14} height={14} />
            {result.website.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      {savingError !== null && <p className="lead-card-error">{savingError}</p>}

      <div className="lead-card-foot">
        <span className="lead-card-source">
          {PROVIDER_LABELS[result.providerId] ?? result.providerId} ·{' '}
          {new Date(result.retrievedAt).toLocaleDateString('ar-EG')}
        </span>
        <div className="lead-card-actions">
          {savedLead !== null && onStatusChange !== undefined && (
            <select
              className="status-select"
              value={savedLead.status}
              aria-label="حالة العميل المحتمل"
              onChange={(event) => onStatusChange(event.target.value as LeadStatus)}
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="secondary" onClick={onOpen}>
            فتح التفاصيل
          </button>
          {savedLead !== null ? (
            <button
              type="button"
              className="danger"
              disabled={removing}
              onClick={() => void handleRemove()}
              aria-label="حذف"
            >
              <IconTrash width={16} height={16} />
              حذف
            </button>
          ) : (
            <button type="button" className="primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? (
                'جارٍ الحفظ…'
              ) : (
                <>
                  <IconBookmark width={16} height={16} />
                  حفظ
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {savedLead !== null && savedLead.notes !== null && savedLead.notes.length > 0 && (
        <p className="lead-card-notes">
          <IconNote width={13} height={13} />
          {savedLead.notes}
        </p>
      )}
      {savedLead !== null && (savedLead.notes === null || savedLead.notes.length === 0) && (
        <span className="lead-card-notes placeholder">لا توجد ملاحظات بعد.</span>
      )}
    </article>
  );
}
