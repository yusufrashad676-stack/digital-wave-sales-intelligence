import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchMe } from '../api/auth';
import type { UserProfile } from '../api/auth';
import {
  fetchSavedLeads,
  removeSavedLead,
  resultToSavePayload,
  saveLead,
  savedLeadToResult,
  updateSavedLead,
} from '../api/leads';
import type { LeadStatus, SavedLead } from '../api/leads';
import type { SearchFilters, SearchResult } from '../api/search';
import LeadsPipelineView from './LeadsPipelineView';
import ResultDrawer from './ResultDrawer';
import RecentSearchesView from './RecentSearchesView';
import SavedLeadsView from './SavedLeadsView';
import SearchView from './SearchView';
import SettingsView from './SettingsView';
import { IconBookmark, IconHistory, IconLogout, IconSearch, IconSliders, IconUsers, WaveLogo } from './icons';

type ViewId = 'search' | 'recent' | 'saved' | 'leads' | 'settings';

interface NavItem {
  id: ViewId;
  label: string;
  icon: ReactNode;
}

interface Props {
  accessToken: string;
  onLogout: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'search', label: 'البحث', icon: <IconSearch /> },
  { id: 'recent', label: 'عمليات البحث', icon: <IconHistory /> },
  { id: 'saved', label: 'النتائج المحفوظة', icon: <IconBookmark /> },
  { id: 'leads', label: 'العملاء المحتملين', icon: <IconUsers /> },
  { id: 'settings', label: 'الإعدادات', icon: <IconSliders /> },
];

export default function Workspace({ accessToken, onLogout }: Props) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [view, setView] = useState<ViewId>('search');
  const [rerun, setRerun] = useState<{ query: string; filters: SearchFilters } | null>(null);

  const [savedLeads, setSavedLeads] = useState<SavedLead[]>([]);
  const [savedLeadsLoading, setSavedLeadsLoading] = useState(true);
  const [savedLeadsError, setSavedLeadsError] = useState<string | null>(null);
  const [savingLead, setSavingLead] = useState(false);
  const [drawerResult, setDrawerResult] = useState<SearchResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMe()
      .then((profile) => {
        if (!cancelled) {
          setUser(profile);
        }
      })
      .catch(() => {
        // keep the sidebar anonymous on a transient /me failure; search still works
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const refreshSavedLeads = useCallback(async () => {
    setSavedLeadsLoading(true);
    setSavedLeadsError(null);
    try {
      const response = await fetchSavedLeads();
      setSavedLeads(response.data);
    } catch (err) {
      setSavedLeadsError(err instanceof Error ? err.message : 'حدث خطأ أثناء تحميل العملاء المحتملين');
    } finally {
      setSavedLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSavedLeads();
  }, [refreshSavedLeads]);

  const handleSaveLead = useCallback(async (result: SearchResult) => {
    setSavingLead(true);
    try {
      const saved = await saveLead(resultToSavePayload(result));
      setSavedLeads((prev) => {
        const index = prev.findIndex((lead) => lead.providerRecordId === saved.providerRecordId);
        if (index === -1) {
          return [saved, ...prev];
        }
        const next = [...prev];
        next[index] = saved;
        return next;
      });
    } finally {
      setSavingLead(false);
    }
  }, []);

  const handleUpdateLead = useCallback(async (id: string, patch: { status?: LeadStatus; notes?: string | null }) => {
    const updated = await updateSavedLead(id, patch);
    setSavedLeads((prev) => prev.map((lead) => (lead.id === id ? updated : lead)));
  }, []);

  const handleRemoveLead = useCallback(async (id: string) => {
    await removeSavedLead(id);
    setSavedLeads((prev) => prev.filter((lead) => lead.id !== id));
  }, []);

  const handleRerun = useCallback((query: string, filters: SearchFilters) => {
    setRerun({ query, filters });
    setView('search');
  }, []);

  const handleConsumeRerun = useCallback(() => {
    setRerun(null);
  }, []);

  function openFromSaved(lead: SavedLead) {
    setDrawerResult(savedLeadToResult(lead));
  }

  const drawerSavedLead =
    drawerResult === null
      ? null
      : (savedLeads.find((lead) => lead.providerRecordId === drawerResult.providerRecordId) ?? null);

  const displayName = user?.displayName ?? user?.email ?? '';
  const initial = displayName.trim().charAt(0).toUpperCase() || '؟';

  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <WaveLogo />
          </span>
          <span className="brand-text">
            <strong>Digital Wave</strong>
            <span>Sales Intelligence</span>
          </span>
        </div>

        <nav className="side-nav" aria-label="التنقل الرئيسي">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <span className="avatar">{initial}</span>
          <span className="user-meta">
            <strong>{displayName}</strong>
            <span>مسوّق</span>
          </span>
          <button type="button" className="icon-btn" onClick={onLogout} aria-label="تسجيل الخروج" title="تسجيل الخروج">
            <IconLogout />
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        {view === 'search' && (
          <SearchView
            rerun={rerun}
            onConsumeRerun={handleConsumeRerun}
            savedLeads={savedLeads}
            onSaveLead={handleSaveLead}
            onOpenResult={setDrawerResult}
          />
        )}
        {view === 'recent' && <RecentSearchesView onRerun={handleRerun} onStartSearch={() => setView('search')} />}
        {view === 'saved' && (
          <SavedLeadsView
            leads={savedLeads}
            loading={savedLeadsLoading}
            error={savedLeadsError}
            onRetry={() => void refreshSavedLeads()}
            onOpen={openFromSaved}
            onStatusChange={(id, status) => void handleUpdateLead(id, { status })}
            onRemove={handleRemoveLead}
            onStartSearch={() => setView('search')}
          />
        )}
        {view === 'leads' && (
          <LeadsPipelineView
            leads={savedLeads}
            loading={savedLeadsLoading}
            error={savedLeadsError}
            onRetry={() => void refreshSavedLeads()}
            onOpen={openFromSaved}
            onStartSearch={() => setView('search')}
          />
        )}
        {view === 'settings' && <SettingsView user={user} onLogout={onLogout} />}
      </main>

      {drawerResult !== null && (
        <ResultDrawer
          result={drawerResult}
          savedLead={drawerSavedLead}
          saving={savingLead}
          onSave={() => void handleSaveLead(drawerResult)}
          onUpdateStatus={(id, status) => void handleUpdateLead(id, { status })}
          onUpdateNotes={(id, notes) => handleUpdateLead(id, { notes })}
          onRemove={handleRemoveLead}
          onClose={() => setDrawerResult(null)}
        />
      )}
    </div>
  );
}
