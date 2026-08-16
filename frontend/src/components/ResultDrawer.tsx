import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { LeadStatus, SavedLead } from '../api/leads';
import type { SearchResult } from '../api/search';
import {
  CATEGORY_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  PROVIDER_LABELS,
  VERIFICATION_LABELS,
} from '../api/search-options';
import { IconBookmark, IconClose, IconGlobe, IconNote, IconPhone, IconStar, IconTrash } from './icons';

interface Props {
  result: SearchResult;
  savedLead: SavedLead | null;
  saving: boolean;
  onSave: () => void;
  onUpdateStatus: (id: string, status: LeadStatus) => void;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="drawer-field">
      <span className="drawer-label">{label}</span>
      <span className="drawer-value">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="drawer-section">
      <h3 className="drawer-section-title">{title}</h3>
      <div className="drawer-fields">{children}</div>
    </section>
  );
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
    case 'QUALIFIED':
      return 'badge status-qualified';
    case 'DISQUALIFIED':
      return 'badge status-disqualified';
    default:
      return 'badge status-contacted';
  }
}

function NotesEditor({
  savedLead,
  onUpdateNotes,
}: {
  savedLead: SavedLead;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
}) {
  const [value, setValue] = useState(savedLead.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setValue(savedLead.notes ?? '');
  }, [savedLead.id, savedLead.notes]);

  const dirty = value !== (savedLead.notes ?? '');

  return (
    <div className="drawer-notes">
      <textarea
        className="notes-input"
        rows={4}
        maxLength={4000}
        dir="rtl"
        placeholder="أضف ملاحظاتك حول هذا العميل المحتمل…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="drawer-notes-foot">
        <span className="muted">{value.length}/4000</span>
        <button
          type="button"
          className="primary small"
          disabled={!dirty || savingNotes}
          onClick={() => {
            setSavingNotes(true);
            void onUpdateNotes(savedLead.id, value).finally(() => setSavingNotes(false));
          }}
        >
          {savingNotes ? 'جارٍ الحفظ…' : 'حفظ الملاحظة'}
        </button>
      </div>
    </div>
  );
}

export default function ResultDrawer({
  result,
  savedLead,
  saving,
  onSave,
  onUpdateStatus,
  onUpdateNotes,
  onRemove,
  onClose,
}: Props) {
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="تفاصيل العميل المحتمل"
      >
        <header className="drawer-header">
          <div>
            <h2>{result.companyName}</h2>
            <div className="drawer-header-badges">
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
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <IconClose />
          </button>
        </header>

        <div className="drawer-body">
          <Section title="معلومات النشاط">
            <Field label="التصنيف">
              {result.category !== null ? (CATEGORY_LABELS[result.category] ?? result.category) : 'غير متوفر'}
            </Field>
            <Field label="المنطقة">{result.area ?? 'غير متوفر'}</Field>
            <Field label="العنوان">{result.address ?? 'غير متوفر'}</Field>
            <Field label="الهاتف">
              {result.phone ? (
                <a className="with-icon" href={`tel:${result.phone}`}>
                  <IconPhone width={15} height={15} />
                  <span dir="ltr">{result.phone}</span>
                </a>
              ) : (
                'غير متوفر'
              )}
            </Field>
            <Field label="الموقع الإلكتروني">
              {result.website ? (
                <a className="with-icon" href={result.website} target="_blank" rel="noreferrer">
                  <IconGlobe width={15} height={15} />
                  <span dir="ltr">{result.website.replace(/^https?:\/\//, '')}</span>
                </a>
              ) : (
                'غير متوفر'
              )}
            </Field>
            <Field label="التقييم">
              {result.rating !== null ? (
                <span className="rating">
                  <IconStar width={15} height={15} />
                  <strong>{result.rating.toFixed(1)}</strong>
                  {result.ratingCount !== null && <span className="muted">من {result.ratingCount} تقييم</span>}
                </span>
              ) : (
                'غير متوفر'
              )}
            </Field>
            <Field label="حالة التوثيق">
              <span className={verificationClass(result.verificationStatus)}>
                {VERIFICATION_LABELS[result.verificationStatus]}
              </span>
            </Field>
          </Section>

          <Section title="المصدر">
            <Field label="اسم المصدر">{PROVIDER_LABELS[result.providerId] ?? result.providerId}</Field>
            <Field label="تاريخ الاسترجاع">{new Date(result.retrievedAt).toLocaleString('ar-EG')}</Field>
            <Field label="رابط المصدر">
              {result.sourceUrl ? (
                <a href={result.sourceUrl} target="_blank" rel="noreferrer">
                  عرض في المصدر
                </a>
              ) : (
                'غير متوفر'
              )}
            </Field>
          </Section>

          <Section title={savedLead !== null ? 'إدارة العميل المحتمل' : 'حفظ العميل المحتمل'}>
            {savedLead === null ? (
              <div className="drawer-save-cta">
                <p>احفظ هذا النشاط ضمن قائمة العملاء المحتملين لتتابع حالته وتضيف ملاحظاتك عليه.</p>
                <button type="button" className="primary" disabled={saving} onClick={onSave}>
                  <IconBookmark width={16} height={16} />
                  {saving ? 'جارٍ الحفظ…' : 'حفظ كعميل محتمل'}
                </button>
              </div>
            ) : (
              <div className="drawer-lead-manage">
                <div className="drawer-field">
                  <span className="drawer-label">الحالة</span>
                  <select
                    className="status-select"
                    value={savedLead.status}
                    aria-label="حالة العميل المحتمل"
                    onChange={(event) => void onUpdateStatus(savedLead.id, event.target.value as LeadStatus)}
                  >
                    {LEAD_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {LEAD_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="drawer-field">
                  <span className="drawer-label">ملاحظات</span>
                  <NotesEditor savedLead={savedLead} onUpdateNotes={onUpdateNotes} />
                </div>
                <div className="drawer-field">
                  <span className="drawer-label">تاريخ الحفظ</span>
                  <span>{new Date(savedLead.savedAt).toLocaleString('ar-EG')}</span>
                </div>
                <button
                  type="button"
                  className="danger"
                  disabled={removing}
                  onClick={() => {
                    setRemoving(true);
                    void onRemove(savedLead.id).finally(() => setRemoving(false));
                  }}
                >
                  <IconTrash width={15} height={15} />
                  {removing ? 'جارٍ الحذف…' : 'حذف من المحفوظات'}
                </button>
              </div>
            )}
          </Section>

          <p className="drawer-note">
            <IconNote width={13} height={13} />
            {savedLead === null
              ? 'تُحفظ نتائج البحث مؤقتًا ضمن سجل عمليات البحث، بينما العملاء المحتملون فقط يُحفظون بشكل دائم.'
              : 'يمكنك تحديث حالة العميل المحتمل وملاحظاتك في أي وقت، وستُنعكس التغييرات على جميع الأقسام.'}
          </p>
        </div>
      </aside>
    </div>
  );
}
