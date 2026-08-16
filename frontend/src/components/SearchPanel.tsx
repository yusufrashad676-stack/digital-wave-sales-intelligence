import { CATEGORIES, CATEGORY_LABELS, GOVERNORATES, GOVERNORATE_LABELS, MIN_RATINGS } from '../api/search-options';
import { IconSearch, IconSliders } from './icons';

interface Props {
  query: string;
  governorate: string;
  category: string;
  minRating: string;
  verifiedOnly: boolean;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onGovernorateChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onMinRatingChange: (value: string) => void;
  onVerifiedOnlyChange: (checked: boolean) => void;
  onSubmit: () => void;
  onClearFilters: () => void;
}

export default function SearchPanel({
  query,
  governorate,
  category,
  minRating,
  verifiedOnly,
  loading,
  onQueryChange,
  onGovernorateChange,
  onCategoryChange,
  onMinRatingChange,
  onVerifiedOnlyChange,
  onSubmit,
  onClearFilters,
}: Props) {
  const hasActiveFilters = governorate !== '' || category !== '' || minRating !== '' || verifiedOnly;

  return (
    <form
      className="search-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="search-panel-row">
        <div className="search-input-wrap">
          <IconSearch className="search-input-icon" />
          <input
            type="search"
            className="query-input"
            placeholder="ابحث عن نشاط تجاري… مثال: عيادات في التجمع"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            maxLength={255}
            autoFocus
          />
        </div>
        <button type="submit" className="primary search-submit" disabled={loading || query.trim().length === 0}>
          {loading ? 'جارٍ البحث…' : 'بحث'}
        </button>
      </div>

      <div className="filter-row">
        <span className="filter-row-label">
          <IconSliders width={15} height={15} />
          الفلاتر
        </span>
        <label>
          المحافظة
          <select value={governorate} onChange={(event) => onGovernorateChange(event.target.value)}>
            <option value="">الكل</option>
            {GOVERNORATES.map((g) => (
              <option key={g} value={g}>
                {GOVERNORATE_LABELS[g] ?? g}
              </option>
            ))}
          </select>
        </label>
        <label>
          التصنيف
          <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
            <option value="">كل التصنيفات</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        <label>
          الحد الأدنى للتقييم
          <select value={minRating} onChange={(event) => onMinRatingChange(event.target.value)}>
            {MIN_RATINGS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(event) => onVerifiedOnlyChange(event.target.checked)}
          />
          موثّق فقط
        </label>
        {hasActiveFilters && (
          <button type="button" className="link-btn" onClick={onClearFilters}>
            مسح الفلاتر
          </button>
        )}
      </div>
    </form>
  );
}
