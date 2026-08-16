import { useCallback, useEffect, useState } from 'react';
import type { SavedLead } from '../api/leads';
import { searchBusinesses } from '../api/search';
import type { SearchFilters, SearchResult } from '../api/search';
import { IconSearch } from './icons';
import LeadCard from './LeadCard';
import SearchPanel from './SearchPanel';

interface Props {
  rerun: { query: string; filters: SearchFilters } | null;
  onConsumeRerun: () => void;
  savedLeads: SavedLead[];
  onSaveLead: (result: SearchResult) => Promise<void>;
  onOpenResult: (result: SearchResult) => void;
}

const EXAMPLE_SEARCHES = ['عيادات', 'طب أسنان', 'مطاعم', 'مراكز طبية'];

export default function SearchView({ rerun, onConsumeRerun, savedLeads, onSaveLead, onOpenResult }: Props) {
  const [query, setQuery] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [category, setCategory] = useState('');
  const [minRating, setMinRating] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [lastSearch, setLastSearch] = useState<{ query: string; filters: SearchFilters } | null>(null);

  const performSearch = useCallback(async (searchQuery: string, filters: SearchFilters) => {
    setLoading(true);
    setError(null);
    setResults([]);
    setLastSearch({ query: searchQuery, filters });
    try {
      const response = await searchBusinesses(searchQuery, filters);
      setResults(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء البحث');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  useEffect(() => {
    if (rerun === null) {
      return;
    }
    setQuery(rerun.query);
    setGovernorate(rerun.filters.governorate ?? '');
    setCategory(rerun.filters.category ?? '');
    setMinRating(rerun.filters.minRating !== undefined ? String(rerun.filters.minRating) : '');
    setVerifiedOnly(rerun.filters.verifiedOnly === true);
    void performSearch(rerun.query, rerun.filters);
    onConsumeRerun();
  }, [rerun, performSearch, onConsumeRerun]);

  function currentFilters(): SearchFilters {
    return {
      ...(governorate ? { governorate } : {}),
      ...(category ? { category } : {}),
      ...(minRating ? { minRating: Number(minRating) } : {}),
      ...(verifiedOnly ? { verifiedOnly } : {}),
    };
  }

  const hasActiveFilters = governorate !== '' || category !== '' || minRating !== '' || verifiedOnly;

  function handleSubmit() {
    const trimmed = query.trim();
    if (trimmed.length === 0 || loading) {
      return;
    }
    void performSearch(trimmed, currentFilters());
  }

  function handleExample(example: string) {
    setQuery(example);
    void performSearch(example, {});
  }

  function handleClearFilters() {
    setGovernorate('');
    setCategory('');
    setMinRating('');
    setVerifiedOnly(false);
  }

  function handleRetry() {
    if (lastSearch !== null) {
      void performSearch(lastSearch.query, lastSearch.filters);
    }
  }

  const savedIds = new Set(savedLeads.map((lead) => lead.providerRecordId));
  const showGrid = searched && !loading && error === null && results.length > 0;

  return (
    <div className="view">
      <header className="view-header">
        <h1>اكتشف عملاء جدد</h1>
        <p>ابحث في الأنشطة التجارية واستخرج بيانات جهات الاتصال والتقييمات لحظيًا.</p>
      </header>

      <SearchPanel
        query={query}
        governorate={governorate}
        category={category}
        minRating={minRating}
        verifiedOnly={verifiedOnly}
        loading={loading}
        onQueryChange={setQuery}
        onGovernorateChange={setGovernorate}
        onCategoryChange={setCategory}
        onMinRatingChange={setMinRating}
        onVerifiedOnlyChange={setVerifiedOnly}
        onSubmit={handleSubmit}
        onClearFilters={handleClearFilters}
      />

      {!searched && !loading && error === null && (
        <section className="initial-state">
          <div className="initial-state-mark">
            <IconSearch width={28} height={28} />
          </div>
          <h2>ماذا تبحث عنه اليوم؟</h2>
          <p>جرّب إحدى عمليات البحث الجاهزة:</p>
          <div className="example-chips">
            {EXAMPLE_SEARCHES.map((example) => (
              <button key={example} type="button" className="chip" onClick={() => handleExample(example)}>
                {example}
              </button>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="skeleton-results" aria-label="جارٍ البحث…">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="skeleton-row" />
          ))}
        </div>
      )}

      {error !== null && (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button type="button" className="link-btn" onClick={handleRetry}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {showGrid && (
        <section className="results-section" aria-label="نتائج البحث">
          <div className="results-meta">
            <span>
              <strong>{results.length}</strong> نتيجة
            </span>
            <span className="muted">اضغط «حفظ» لإضافته إلى العملاء المحتملين</span>
          </div>
          <div className="lead-grid">
            {results.map((result) => (
              <LeadCard
                key={result.providerRecordId}
                result={result}
                savedLead={
                  savedIds.has(result.providerRecordId)
                    ? (savedLeads.find((lead) => lead.providerRecordId === result.providerRecordId) ?? null)
                    : null
                }
                onSave={() => onSaveLead(result)}
                onOpen={() => onOpenResult(result)}
              />
            ))}
          </div>
        </section>
      )}

      {searched && !loading && error === null && results.length === 0 && (
        <div className="notice empty">
          <p>لا توجد نتائج مطابقة لبحثك.</p>
          {hasActiveFilters ? (
            <button type="button" className="link-btn" onClick={handleClearFilters}>
              مسح الفلاتر
            </button>
          ) : (
            <span>جرّب تعديل كلمات البحث.</span>
          )}
        </div>
      )}
    </div>
  );
}
