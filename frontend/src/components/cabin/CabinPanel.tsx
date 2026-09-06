import { useState, useEffect } from 'react';
import { sanitize } from '@/lib/sanitize';
import { cabinApi, type CabinData, type CabinEntry, type CabinParticipant, type CabinDocument, type CabinFeedback } from '@/api/cabinApi';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { memberApi, type MemberInfo } from '@/api/memberApi';
import { marked } from 'marked';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CabinEntryList } from '@/components/cabin/CabinEntryList';
import { CabinDocumentView } from '@/components/cabin/CabinDocumentView';
import http from '@/lib/http';
import { useT } from '@/i18n/useT';

export function CabinPanel({ compact = false, canCreate = true }: { compact?: boolean; canCreate?: boolean }) {
  const t = useT();
  const [cabins, setCabins] = useState<CabinData[]>([]);
  const [cabinParticipants, setCabinParticipants] = useState<Record<string, CabinParticipant[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCabin, setShowCabin] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState<string | null>(null);
  const [cabinDocs, setCabinDocs] = useState<Record<string, CabinDocument>>({});
  const [docVersions, setDocVersions] = useState<CabinDocument[]>([]);
  const [docFeedback, setDocFeedback] = useState<CabinFeedback[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Create state
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [pmSearch, setPmSearch] = useState('');
  const [viewerSearch, setViewerSearch] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [viewerIds, setViewerIds] = useState<string[]>([]);

  const loadMembers = () => {
    memberApi.listMembers().then(({ data }) => {
      const raw = data?.data;
      const active = Array.isArray(raw) ? raw.filter(m => m.status !== 'disabled') : [];
      setMembers(active);
    }).catch(() => {});
    // Load workspace project leads
    http.get('/projects/leads').then(({ data: resp }: { data: Record<string, unknown> }) => {
      const leadsData = (resp.data as Array<Record<string, unknown>>) || [];
      setLeadIds(new Set(leadsData.map(l => l.id as string)));
    }).catch(() => {});
  };

  const filterMembers = (search: string) => {
    const base = members.filter(m => m.id !== userId);
    if (!search) return base;
    const s = search.toLowerCase();
    return base.filter(m => (m.displayName || '').toLowerCase().includes(s) || (m.email || '').toLowerCase().includes(s));
  };
  // Participants: only workspace project leads (PM/Owner), excluding self
  const filterParticipants = (search: string) => {
    const base = members.filter(m => m.id !== userId && leadIds.has(m.id));
    if (!search) return base;
    const s = search.toLowerCase();
    return base.filter(m => (m.displayName || '').toLowerCase().includes(s) || (m.email || '').toLowerCase().includes(s));
  };

  // Detail state
  const [participants, setParticipants] = useState<CabinParticipant[]>([]);
  const [entries, setEntries] = useState<CabinEntry[]>([]);
  const [doc, setDoc] = useState<CabinDocument | null>(null);
  const [feedback, setFeedback] = useState<CabinFeedback[]>([]);
  const [generating, setGenerating] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [leadIds, setLeadIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{ title: string; msg: string; action: () => void; danger?: boolean } | null>(null);

  const { projects } = useProjectStore();
  const userId = useAuthStore(s => s.user?.id);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const loadCabins = () => {
    cabinApi.list().then(async ({ data }) => {
      const list = Array.isArray(data?.data) ? data.data : [];
      setCabins(list);
      // Load participants + docs sequentially to avoid 429 rate limiting
      for (const c of list) {
        try {
          const p = await cabinApi.listParticipants(c.id).then(r => r.data?.data).catch(() => null);
          if (Array.isArray(p)) setCabinParticipants(prev => ({ ...prev, [c.id]: p }));
        } catch {}
        try {
          const d = await cabinApi.getDocument(c.id).then(r => r.data?.data).catch(() => null);
          if (d) setCabinDocs(prev => ({ ...prev, [c.id]: d }));
        } catch {}
      }
    }).catch(()=>{}).finally(()=>setLoading(false));
  };
  // Defer loading to avoid blocking HomePage first paint
  useEffect(() => {
    const t = setTimeout(() => { loadCabins(); loadMembers(); }, 500);
    return () => clearTimeout(t);
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      // Create with participants + viewers
      await cabinApi.create(name, desc, participantIds);
      // After create, find the new cabin
      const { data } = await cabinApi.list();
      const cabins = data.data || [];
      const created = cabins.find(c => c.name === name.trim());
      if (created) {
        // Add viewers separately with viewer role
        for (const vid of viewerIds) {
          await cabinApi.addParticipant(created.id, vid, 'viewer').catch(()=>{});
        }
        // If creator is a Project Owner/Lead → auto-add self as participant
        if (userId && leadIds.has(userId)) {
          await cabinApi.addParticipant(created.id, userId, 'participant').catch(() => {});
        }
      }
      setName(''); setDesc(''); setParticipantIds([]); setViewerIds([]);
      setPmSearch(''); setViewerSearch('');
      setShowCreate(false); loadCabins();
    } catch { /* */ }
    finally { setSaving(false); }
  };

  const openCabin = async (cabinId: string) => {
    setShowCabin(cabinId);
    loadMembers(); // ensure fresh member names
    const [p, e, d, f] = await Promise.all([
      cabinApi.listParticipants(cabinId).then(r => r.data.data || []).catch(() => []),
      cabinApi.listEntries(cabinId).then(r => r.data.data || []).catch(() => []),
      cabinApi.getDocument(cabinId).then(r => r.data.data).catch(() => null),
      cabinApi.listFeedback(cabinId).then(r => r.data.data || []).catch(() => []),
    ]);
    setParticipants(p); setEntries(e); setDoc(d); setFeedback(f);
    setCabinParticipants(prev => ({ ...prev, [cabinId]: p }));
  };

  const handleGenerate = async () => {
    if (!showCabin) return;
    setGenerating(true);
    try {
      await cabinApi.generateDocument(showCabin);
      // Fetch saved doc — use any to handle nested Axios response
      const resp = await cabinApi.getDocument(showCabin).catch(() => null);
      const respRecord = resp as Record<string, unknown> | null;
      const respData = respRecord?.data as Record<string, unknown> | undefined;
      const newDoc = (respData?.data as CabinDocument) || (respData as unknown as CabinDocument) || null;
      if (newDoc?.content) setDoc(newDoc);
      // Reload feedback
      const f = await cabinApi.listFeedback(showCabin).then(r => r.data.data || []).catch(() => []);
      setFeedback(f);
    } catch { /* */ }
    finally { setGenerating(false); }
  };

  const handleFeedback = async () => {
    if (!showCabin || !doc || !feedbackText.trim()) return;
    setSendingFeedback(true);
    try {
      await cabinApi.addFeedback(showCabin, doc.id, '', feedbackText);
      setFeedbackText('');
      const f = await cabinApi.listFeedback(showCabin).then(r => r.data.data || []).catch(() => []);
      setFeedback(f);
    } catch { /* */ }
    finally { setSendingFeedback(false); }
  };

  const getProjectName = (id: string) => (Array.isArray(projects) ? projects.find(p => p.id === id)?.name : null) || id?.substring(0, 10) + '...';
  const getUserName = (uid: string) => (Array.isArray(members) ? members.find(m => m.id === uid)?.displayName : null) || uid?.substring(0, 8) + '...';
  const userProjects = Array.isArray(projects) ? projects.filter(p => p.leadId === userId && !(Array.isArray(entries) && entries.some(e => e.projectId === p.id))) : [];

  // Cabin detail: detect current user's role
  const currentUserRole = showCabin
    ? (participants.find(p => p.userId === userId)?.role || (cabins.find(c => c.id === showCabin)?.createdBy === userId ? 'creator' : undefined))
    : undefined;
  const isCabinCreator = showCabin ? cabins.find(c => c.id === showCabin)?.createdBy === userId : false;
  const isParticipant = currentUserRole === 'participant';
  const isViewer = currentUserRole === 'viewer';
  const parts = Array.isArray(participants) ? participants : [];
  const allAuthorized = parts.filter(p => p.role === 'participant').every(p => p.status === 'accepted');
  const authorizedCount = parts.filter(p => p.role === 'participant' && p.status === 'accepted').length;
  const participantCount = parts.filter(p => p.role === 'participant').length;
  const pendingParticipants = parts.filter(p => p.role === 'participant' && p.status === 'pending');

  // Visibility: PM/Owner always sees; others only if they have cabins.
  // Hide while loading too — otherwise users without cabins see a skeleton
  // card flash for ~500ms on every Home mount.
  if (!canCreate && (loading || cabins.length === 0)) return null;

  return (
    <>
      {/* ═══ Card ═══ */}
      <div className="card ai-glow" style={{ borderColor: 'hsl(var(--brand-main)/0.2)' }}>
        <CabinEntryList
          entries={cabins}
          participants={cabinParticipants}
          activeEntryId={showCabin}
          loading={loading}
          compact={compact}
          canCreate={canCreate}
          userId={userId}
          onSelectEntry={openCabin}
          onNewEntry={() => { setShowCreate(true); loadMembers(); }}
          onViewDocument={(cabinId) => {
            cabinApi.getDocument(cabinId).then(({data:d})=>setCabinDocs(prev=>({...prev,[cabinId]:d.data})));
            cabinApi.listDocuments(cabinId).then(({data:d})=>setDocVersions(d.data||[])).catch(()=>{});
            cabinApi.listFeedback(cabinId).then(({data:d})=>setDocFeedback(d.data||[])).catch(()=>{});
            setShowDoc(cabinId);
          }}
          hasDocument={(cabinId) => !!cabinDocs[cabinId]}
        />
      </div>

      {/* ═══ Create Cabin Modal ═══ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="card shadow-dialog" style={{ width:'540px', maxHeight:'80vh', overflowY:'auto' }}>
            <div className="card-hd flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.cabin.title}</h3>
              <button className="btn-ghost text-lg px-1" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="card-bd flex flex-col gap-3" style={{ padding:'20px' }}>
              <div className="form-grp">
                <label className="form-label">{t.cabin.meetingName}</label>
                <input className="form-input" placeholder={t.cabin.meetingNamePlaceholder} value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="form-grp">
                <label className="form-label">{t.cabin.description}</label>
                <input className="form-input" placeholder={t.cabin.descriptionPlaceholder} value={desc} onChange={e => setDesc(e.target.value)} />
              </div>

              {/* Participants row */}
              <div className="form-grp">
                <label className="form-label">{t.cabin.participants} <span className="text-brand-main">{t.cabin.participantsHint}</span></label>
                <input className="form-input text-xs" placeholder={t.cabin.filterParticipants} value={pmSearch}
                  onChange={e => setPmSearch(e.target.value)} />
                <div className="border border-edge rounded-card mt-1 max-h-32 overflow-y-auto">
                  {filterParticipants(pmSearch).map(m => (
                    <label key={'p'+m.id} className="flex items-center gap-2 px-2 py-1 text-[0.625rem] cursor-pointer hover:bg-surface-hover">
                      <input type="checkbox" className="w-3 h-3"
                        checked={participantIds.includes(m.id)}
                        onChange={() => {
                          if (participantIds.includes(m.id)) setParticipantIds(prev => prev.filter(id => id !== m.id));
                          else { setParticipantIds(prev => [...prev, m.id]); setViewerIds(prev => prev.filter(id => id !== m.id)); }
                        }} />
                      <span className="truncate flex-1">{m.displayName || m.id?.substring(0,8)} <span className="text-ink-muted">{m.email}</span></span>
                    </label>
                  ))}
                </div>
                {participantIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {participantIds.map(uid => {
                      const m = (Array.isArray(members) ? members : []).find(x => x.id === uid);
                      return <span key={uid} className="text-[0.625rem] bg-brand-soft/20 text-brand-main px-2 py-0.5 rounded-full cursor-pointer"
                        onClick={() => setParticipantIds(prev => prev.filter(id => id !== uid))}>
                        {m?.displayName || uid.substring(0,8)} ✕
                      </span>;
                    })}
                  </div>
                )}
              </div>

              {/* Viewers row */}
              <div className="form-grp">
                <label className="form-label">{t.cabin.viewers} <span className="text-ink-muted">{t.cabin.viewersHint}</span></label>
                <input className="form-input text-xs" placeholder={t.cabin.filterViewers} value={viewerSearch}
                  onChange={e => setViewerSearch(e.target.value)} />
                <div className="border border-edge rounded-card mt-1 max-h-32 overflow-y-auto">
                  {filterMembers(viewerSearch).map(m => (
                    <label key={'v'+m.id} className="flex items-center gap-2 px-2 py-1 text-[0.625rem] cursor-pointer hover:bg-surface-hover">
                      <input type="checkbox" className="w-3 h-3"
                        checked={viewerIds.includes(m.id)}
                        onChange={() => {
                          if (viewerIds.includes(m.id)) setViewerIds(prev => prev.filter(id => id !== m.id));
                          else { setViewerIds(prev => [...prev, m.id]); setParticipantIds(prev => prev.filter(id => id !== m.id)); }
                        }} />
                      <span className="truncate flex-1">{m.displayName || m.id?.substring(0,8)} <span className="text-ink-muted">{m.email}</span></span>
                    </label>
                  ))}
                </div>
                {viewerIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {viewerIds.map(uid => {
                      const m = (Array.isArray(members) ? members : []).find(x => x.id === uid);
                      return <span key={uid} className="text-[0.625rem] bg-surface-hover text-ink-muted px-2 py-0.5 rounded-full cursor-pointer"
                        onClick={() => setViewerIds(prev => prev.filter(id => id !== uid))}>
                        {m?.displayName || uid.substring(0,8)} ✕
                      </span>;
                    })}
                  </div>
                )}
              </div>

            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-edge">
              <button className="btn-ghost" onClick={() => setShowCreate(false)}>{t.cabin.cancel}</button>
              <button className="btn-brand" onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? t.cabin.creating : t.cabin.create}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Cabin Detail Modal — Role-based ═══ */}
      {showCabin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) { setShowCabin(null); loadCabins(); } }}>
          <div className="card shadow-dialog" style={{ width:'700px', maxHeight:'80vh', overflowY:'auto' }}>
            <div className="card-hd flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">{cabins.find(c => c.id === showCabin)?.name}</h3>
                <p className="text-[0.625rem] text-ink-muted mt-0.5">
                  {isCabinCreator && ('You created this cabin — wait for participants to authorize.')}
                  {isParticipant && ('Select your projects below and click Authorize to grant AI access.')}
                  {isViewer && ('View the AI-generated report and participant feedback.')}
                </p>
              </div>
              <button className="btn-ghost text-lg px-1" onClick={() => { setShowCabin(null); loadCabins(); }}>✕</button>
            </div>
            <div className="card-bd flex flex-col gap-4" style={{ padding:'20px' }}>

              {/* ═══ PARTICIPANT VIEW: Authorize Projects ═══ */}
              {isParticipant && (
                <>
                  <div className="p-3 rounded-card bg-brand-soft/20">
                    <p className="text-xs font-semibold text-brand-main mb-1">{t.cabin.authorizeTitle}</p>
                    <p className="text-[0.625rem] text-ink-muted">{t.cabin.authorizeDesc}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1.5">{t.cabin.yourProjects(userProjects.length)}</p>
                    <div className="border border-edge rounded-card max-h-48 overflow-y-auto">
                      {userProjects.map(p => (
                        <label key={p.id} className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-surface-hover ${selectedProjects.includes(p.id) ? 'bg-brand-soft/10' : ''}`}>
                          <input type="checkbox" className="w-3.5 h-3.5"
                            checked={selectedProjects.includes(p.id)}
                            onChange={() => {
                              setSelectedProjects(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]);
                            }} />
                          <span className="flex-1">{p.name} <span className="text-ink-muted">({p.key})</span></span>
                        </label>
                      ))}
                    </div>
                    {userProjects.length === 0 && (
                      <p className="text-[0.625rem] text-ink-muted py-3 text-center">{t.cabin.noProjects}</p>
                    )}
                    <button className="btn-brand mt-3" style={{ width:'100%' }}
                      onClick={async () => {
                        if (!showCabin || selectedProjects.length === 0) return;
                        await cabinApi.authorize(showCabin, selectedProjects);
                        setSelectedProjects([]);
                        const e = await cabinApi.listEntries(showCabin).then(r=>r.data.data||[]).catch(()=>[]);
                        setEntries(e);
                        const p = await cabinApi.listParticipants(showCabin).then(r=>r.data.data||[]).catch(()=>[]);
                        setParticipants(p);
                      }} disabled={selectedProjects.length === 0}>
                      {t.cabin.authorize(selectedProjects.length)}
                    </button>
                  </div>
                </>
              )}

              {/* ═══ CREATOR VIEW: Progress & Generate ═══ */}
              {isCabinCreator && (
                <>
                  {/* Progress Tracker */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold">{t.cabin.progressTitle}</p>
                      <span className="text-xs font-semibold text-brand-main">{authorizedCount}/{participantCount}</span>
                    </div>
                    <div className="progress mb-3" style={{ height:'6px' }}>
                      <div className="progress-bar brand" style={{ width: `${participantCount > 0 ? (authorizedCount/participantCount)*100 : 0}%` }} />
                    </div>

                    {/* Participants row */}
                    <p className="text-[0.625rem] font-semibold text-ink-muted uppercase mb-1">{t.cabin.participantsLabel}</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {participants.filter(p=>p.role==='participant').map(p => (
                        <span key={p.id} className={`text-[0.625rem] px-2 py-1 rounded-full ${p.status==='accepted' ? 'bg-success/10 text-success font-medium' : 'bg-warning/10 text-warning'}`}>
                          {getUserName(p.userId)} {p.status==='accepted' ? '✓' : '⏳'}
                        </span>
                      ))}
                      {participants.filter(p=>p.role==='participant').length === 0 && (
                        <span className="text-[0.625rem] text-ink-muted">{t.cabin.none}</span>
                      )}
                    </div>

                    {/* Viewers row */}
                    <p className="text-[0.625rem] font-semibold text-ink-muted uppercase mb-1">{t.cabin.viewersLabel}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {participants.filter(p=>p.role==='viewer').map(p => (
                        <span key={p.id} className="text-[0.625rem] px-2 py-1 rounded-full bg-surface-hover text-ink-muted">
                          {getUserName(p.userId)}
                        </span>
                      ))}
                      {participants.filter(p=>p.role==='viewer').length === 0 && (
                        <span className="text-[0.625rem] text-ink-muted">{t.cabin.none}</span>
                      )}
                    </div>
                    {pendingParticipants.length > 0 && (
                      <p className="text-[0.625rem] text-warning mt-2">
                        {t.cabin.pending(pendingParticipants.length)}
                      </p>
                    )}
                  </div>

                  {/* Mounted Projects (read-only for creator) */}
                  {entries.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5">{t.cabin.authorizedProjects(entries.length)}</p>
                      {entries.map(e => (
                        <div key={e.id} className="flex items-center gap-3 py-1.5 px-2 text-[0.625rem] border-b border-edge">
                          <span className="text-ink-primary font-medium flex-1 truncate">{e.projectName || e.projectKey || getProjectName(e.projectId)}</span>
                          <span className="text-ink-muted shrink-0">{t.cabin.by(getUserName(e.attachedBy))}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Generate (only when no doc yet) + Cancel/End */}
                  {(() => { const ended = cabins.find(c=>c.id===showCabin)?.status !== 'open'; return (<>
                  {!doc && (
                  <button className="btn-brand" style={{ width:'100%', padding:'12px' }}
                    onClick={handleGenerate} disabled={generating || entries.length===0 || ended}>
                    {generating ? t.cabin.aiGenerating : ended ? t.cabin.meetingEnded :
                      entries.length===0 ? t.cabin.waitingAuth :
                      allAuthorized ? t.cabin.generateDoc : t.cabin.generateReady(authorizedCount, participantCount)}
                  </button>
                  )}
                  {allAuthorized && entries.length > 0 && !doc && !ended && (
                    <p className="text-[0.625rem] text-warning text-center">{t.cabin.autoGenerateHint}</p>
                  )}
                  </>); })()}
                  <div className="flex gap-2 mt-2">
                    <button className="btn-ghost btn-xs text-danger" onClick={() => {
                      setConfirmAction({ title: t.cabin.cancelMeetingTitle, msg: t.cabin.cancelMeetingMsg, danger: true, action: async () => {
                        if (!showCabin) return;
                        await cabinApi.update(showCabin, { status: 'cancelled' });
                        setConfirmAction(null); loadCabins(); setShowCabin(null);
                      }});
                    }}>{t.cabin.cancelMeeting}</button>
                    {doc && cabins.find(c=>c.id===showCabin)?.status === 'open' && (
                      <button className="btn-ghost btn-xs" onClick={() => {
                        setConfirmAction({ title: t.cabin.endMeetingTitle, msg: t.cabin.endMeetingMsg, action: async () => {
                          if (!showCabin) return;
                          await cabinApi.update(showCabin, { status: 'closed' });
                          setConfirmAction(null); loadCabins(); setShowCabin(null);
                        }});
                      }}>{t.cabin.endMeeting}</button>
                    )}
                  </div>
                </>
              )}

              {/* ═══ VIEWER VIEW ═══ */}
              {isViewer && !isCabinCreator && entries.length === 0 && !doc && (
                <p className="text-xs text-ink-muted text-center py-4">{t.cabin.waitingView}</p>
              )}

              {/* ═══ SHARED: Document + Feedback ═══ */}
              {doc && (
                <>
                  <div className="p-3 rounded-card bg-surface-hover">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">{t.cabin.panoramaDoc(doc.version, new Date(doc.generatedAt).toLocaleString())}</span>
                      {isCabinCreator && cabins.find(c=>c.id===showCabin)?.status === 'open' && (
                        <button className="btn-brand btn-xs" onClick={handleGenerate} disabled={generating}>
                          {generating ? '...' : t.cabin.regenDoc}
                        </button>
                      )}
                    </div>
                    <div className="text-[0.625rem] text-ink-muted max-h-60 overflow-y-auto cabin-doc"
                      dangerouslySetInnerHTML={{ __html: sanitize(marked.parse(doc.content?.substring(0, 2000) || '') as string) }} />
                  </div>

                  {/* Feedback */}
                  <div>
                    <p className="text-xs font-semibold mb-1.5">{t.cabin.feedback(feedback.length)}</p>
                    {feedback.map(f => (
                      <div key={f.id} className="text-[0.625rem] py-1 px-2 mb-1 bg-surface-hover rounded">
                        <span className="font-medium text-ink-primary">{getUserName(f.userId)}</span>
                        <span className="text-ink-muted ml-1">{new Date(f.createdAt).toLocaleTimeString()}</span>
                        <p className="text-ink-primary mt-0.5">{f.feedback}</p>
                      </div>
                    ))}
                    {cabins.find(c=>c.id===showCabin)?.status === 'open' && (
                      <div className="flex gap-2 mt-2">
                        <input className="form-input text-[0.625rem] flex-1" placeholder={t.cabin.feedbackPlaceholder} value={feedbackText}
                          onChange={e => setFeedbackText(e.target.value)} />
                        <button className="btn-brand btn-xs" onClick={handleFeedback} disabled={sendingFeedback || !feedbackText.trim()}>{t.cabin.send}</button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Bottom close */}
              <div className="flex justify-center pt-2 border-t border-edge">
                <button className="btn-ghost text-xs" onClick={() => { setShowCabin(null); loadCabins(); }}>{t.cabin.close}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ═══ Document View Modal (rich: history + feedback) ═══ */}
      {showDoc && cabinDocs[showDoc] && (
        <CabinDocumentView
          doc={cabinDocs[showDoc]}
          cabinName={cabins.find(c => c.id === showDoc)?.name || ''}
          cabinStatus={cabins.find(c => c.id === showDoc)?.status || ''}
          versions={docVersions}
          feedback={docFeedback}
          isOwner={isCabinCreator}
          onClose={() => setShowDoc(null)}
          onVersionChange={(doc) => { if (showDoc) setCabinDocs(prev => ({...prev, [showDoc!]: doc})); }}
          onDataChange={(data) => {
            if (showDoc) setCabinDocs(prev => ({...prev, [showDoc!]: data.doc}));
            setDocVersions(data.versions);
            setDocFeedback(data.feedback);
          }}
          getUserName={getUserName}
        />
      )}

      {/* ═══ Confirm Dialog ═══ */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title || ''}
        message={confirmAction?.msg || ''}
        confirmLabel={confirmAction?.danger ? t.cabin.yesCancel : 'Confirm'}
        confirmClass={confirmAction?.danger ? 'btn-danger btn-xs' : 'btn-brand btn-xs'}
        onConfirm={() => confirmAction?.action()}
        onCancel={() => setConfirmAction(null)}
      />

    </>
  );
}
