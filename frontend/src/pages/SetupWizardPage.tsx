import { useState, useEffect } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/stores/languageStore';
import type { Lang } from '@/i18n/translations';
import { useT } from '@/i18n/useT';
import { authApi } from '@/api/authApi';
import { configApi } from '@/api/configApi';
import { masterDataApi } from '@/api/masterDataApi';
import { smtpApi, type SmtpConfig } from '@/api/aiApi';
import { aiEnabled } from '@/lib/aiGate';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

const SMTP_PRESETS = [
  { name: 'Gmail', host: 'smtp.gmail.com', port: 587, starttls: true },
  { name: 'Outlook', host: 'smtp.office365.com', port: 587, starttls: true },
  { name: 'QQ Mail', host: 'smtp.qq.com', port: 587, starttls: true },
  { name: '163 Mail', host: 'smtp.163.com', port: 465, starttls: false },
  { name: 'Custom', host: '', port: 587, starttls: true },
];

export function SetupWizardPage() {
  const navigate = useNavigate();
  const { user, currentTenant } = useAuthStore();
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);
  const search = useSearch({ strict: false }) as { invited?: string };
  const isInvited = search.invited === '1' || user?.invited === true;
  const t = useT();

  const GENDERS = [
    { key: 'Male', icon: '♂', label: t.setupWizard.male },
    { key: 'Female', icon: '♀', label: t.setupWizard.female },
    { key: 'PreferNot', icon: '○', label: t.setupWizard.preferNot },
  ];
  const ROLES = [
    { key: 'Project Manager', icon: '📋', persona: 'pm' },
    { key: 'Developer', icon: '💻', persona: 'developer' },
    { key: 'QA / Test', icon: '🧪', persona: 'qa' },
    { key: 'IT Manager', icon: '🖥', persona: 'pm' },
    { key: 'Designer', icon: '🎨', persona: 'viewer' },
    { key: '__custom__', icon: '📝', persona: 'viewer' },
  ];
  const roleLabels: Record<string, string> = {
    'Project Manager': t.setupWizard.roleProjectManager,
    'Developer': t.setupWizard.roleDeveloper,
    'QA / Test': t.setupWizard.roleQaTest,
    'IT Manager': t.setupWizard.roleItManager,
    'Designer': t.setupWizard.roleDesigner,
  };
  const genderLabels: Record<string, string> = {
    'Male': t.setupWizard.male,
    'Female': t.setupWizard.female,
    'PreferNot': t.setupWizard.preferNot,
  };
  const presetLabels: Record<string, string> = {
    'Gmail': t.setupWizard.presetGmail,
    'Outlook': t.setupWizard.presetOutlook,
    'QQ Mail': t.setupWizard.presetQqMail,
    '163 Mail': t.setupWizard.preset163Mail,
    'Custom': t.setupWizard.presetCustom,
  };

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [languageList, setLanguageList] = useState<Array<{key:string;value:string;icon:string}>>([]);
  const [selectedLang, setSelectedLang] = useState(lang);
  const [selectedAiLang, setSelectedAiLang] = useState(user?.aiLanguage || lang);
  const [gender, setGender] = useState(user?.gender || '');
  const [role, setRole] = useState(user?.jobTitle || '');
  const [customRole, setCustomRole] = useState('');
  const [skills, setSkills] = useState<string[]>(() => (user?.skills || '').split(',').filter(Boolean));
  const [skillList, setSkillList] = useState<Array<{key:string;value:string;color:string}>>([]);
  const [customSkill, setCustomSkill] = useState('');

  const [workspaceName, setWorkspaceName] = useState(currentTenant?.name || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');

  const [smtp, setSmtp] = useState<SmtpConfig>({ host: '', port: 587, username: '', password: '', starttls: true, fromName: 'TomiHub' });
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpNextLoading, setSmtpNextLoading] = useState(false);
  const [smtpTestMsg, setSmtpTestMsg] = useState('');

  const [skippedSmtp, setSkippedSmtp] = useState(false);
  const [smtpProvider, setSmtpProvider] = useState('');

  const [aiBackend, setAiBackend] = useState('ollama');
  const [aiOllamaUrl, setAiOllamaUrl] = useState('http://localhost:11434');
  const [aiFlashModel, setAiFlashModel] = useState('');
  const [aiProModel, setAiProModel] = useState('');
  const [aiEmbedModel, setAiEmbedModel] = useState('');
  const [aiCloudProvider, setAiCloudProvider] = useState('deepseek');
  const [aiCloudUrl, setAiCloudUrl] = useState('https://api.deepseek.com/v1');
  const [aiCloudKey, setAiCloudKey] = useState('');
  const [aiCloudFlash, setAiCloudFlash] = useState('deepseek-v4-flash');
  const [aiCloudPro, setAiCloudPro] = useState('deepseek-v4-pro');
  const [aiFlashTimeout, setAiFlashTimeout] = useState('120');
  const [aiProTimeout, setAiProTimeout] = useState('300');
  const [aiTesting, setAiTesting] = useState(false);
  const [aiSaveLoading, setAiSaveLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [timeoutList, setTimeoutList] = useState<Array<{key:string;value:string}>>([]);
  const [cloudModelList, setCloudModelList] = useState<Array<{key:string;value:string}>>([]);
  const [ollamaModelList, setOllamaModelList] = useState<Array<{key:string;value:string}>>([]);
  const [embeddingModelList, setEmbeddingModelList] = useState<Array<{key:string;value:string}>>([]);

  useEffect(() => {
    masterDataApi.list('skill_tags').then((res) => { setSkillList((res.data.data || []) as Array<{key:string;value:string;color:string}>); }).catch(()=>{});
    masterDataApi.list('ui_language').then((res) => { setLanguageList((res.data.data || []) as Array<{key:string;value:string;icon:string}>); }).catch(()=>{});
  }, []);

  useEffect(() => {
    if (isInvited) return;
    if (aiEnabled) {
      configApi.getLlmConfig().then(r => {
        const cfg = (r.data as { data: Record<string,string> }).data || {};
        if (cfg.backend) setAiBackend(cfg.backend); if (cfg.ollamaBaseUrl) setAiOllamaUrl(cfg.ollamaBaseUrl);
        if (cfg.ollamaFlashModel) setAiFlashModel(cfg.ollamaFlashModel); if (cfg.ollamaProModel) setAiProModel(cfg.ollamaProModel);
        if (cfg.embeddingModel) setAiEmbedModel(cfg.embeddingModel); if (cfg.cloudProvider) setAiCloudProvider(cfg.cloudProvider);
        if (cfg.cloudBaseUrl) setAiCloudUrl(cfg.cloudBaseUrl); if (cfg.cloudApiKey) setAiCloudKey(cfg.cloudApiKey);
        if (cfg.cloudFlashModel) setAiCloudFlash(cfg.cloudFlashModel); if (cfg.cloudProModel) setAiCloudPro(cfg.cloudProModel);
        if (cfg.flashTimeout) setAiFlashTimeout(String(cfg.flashTimeout)); if (cfg.proTimeout) setAiProTimeout(String(cfg.proTimeout));
      }).catch(()=>{});
      configApi.getModels().then(r => { setOllamaModels(((r.data as { models: string[] }).models) || []); }).catch(()=>{});
      masterDataApi.list('ai_timeout').then((res) => { setTimeoutList(res.data.data || []); }).catch(()=>{});
      masterDataApi.list('ai_cloud_model').then((res) => { setCloudModelList(res.data.data || []); }).catch(()=>{});
      masterDataApi.list('ai_ollama_model').then((res) => { setOllamaModelList(res.data.data || []); }).catch(()=>{});
      masterDataApi.list('ai_embedding_model').then((res) => { setEmbeddingModelList(res.data.data || []); }).catch(()=>{});
    }
    smtpApi.getConfig().then(r => { const d = r.data.data; if (d?.config) setSmtp(d.config); }).catch(()=>{});
  }, [isInvited]);

  const testSmtp = async () => { setSmtpTesting(true); setSmtpTestMsg(''); setError(''); try { const r = await smtpApi.testConnection(smtp); const d = r.data; const ok = typeof d.data === 'string' && d.data.includes('successful'); setSmtpTestMsg(ok ? t.setupWizard.connectionOk : t.setupWizard.connectionFailed); } catch { setSmtpTestMsg(t.setupWizard.connectionFailed); } finally { setSmtpTesting(false); } };

  // All embedding models — dedup by key, strip :latest tag
  const embedOptions = [...new Map([
    ...embeddingModelList,
    ...ollamaModels.filter(m => /embed|bge|e5|nomic/i.test(m)).map(m => ({key:m.replace(/:latest$/,''), value:m}))
  ].map(x => [x.key, x])).values()];

  const testAi = async (): Promise<boolean> => {
    if (aiBackend==='ollama') {
      if(!aiOllamaUrl) { setAiTestResult({ok:false,msg:t.setupWizard.serverAddressRequired}); return false; }
      if(!aiFlashModel) { setAiTestResult({ok:false,msg:t.setupWizard.quickModelRequired}); return false; }
      if(!aiProModel) { setAiTestResult({ok:false,msg:t.setupWizard.heavyModelRequired}); return false; }
    } else {
      if(!aiCloudKey) { setAiTestResult({ok:false,msg:t.setupWizard.apiKeyRequired}); return false; }
      if(!aiCloudUrl) { setAiTestResult({ok:false,msg:t.setupWizard.baseUrlRequired}); return false; }
      if(!aiCloudFlash) { setAiTestResult({ok:false,msg:t.setupWizard.quickModelRequired}); return false; }
      if(!aiCloudPro) { setAiTestResult({ok:false,msg:t.setupWizard.heavyModelRequired}); return false; }
    }
    if(!aiEmbedModel) { setAiTestResult({ok:false,msg:t.setupWizard.embedModelRequired}); return false; }
    setAiTesting(true); setAiTestResult(null);
    try {
      const r = await configApi.testConnection({
        backend: aiBackend, ollamaBaseUrl: aiOllamaUrl,
        ollamaFlashModel: aiFlashModel, ollamaProModel: aiProModel, embeddingModel: aiEmbedModel,
        cloudBaseUrl: aiCloudUrl, cloudApiKey: aiCloudKey, cloudFlashModel: aiCloudFlash, cloudProModel: aiCloudPro,
      }, { timeout: (Math.max(Number(aiFlashTimeout), Number(aiProTimeout), 60) + 30) * 1000 });
      const raw = ((r.data as Record<string, unknown>).data as string || '').split(';').map(s => s.trim()).filter(Boolean);
      const failures = raw.filter(s => s.includes('failed') || s.includes('not set') || s.includes('not found'));
      const ok = failures.length === 0;
      setAiTestResult({ok, msg: ok ? t.setupWizard.connectionOk : failures.join('; ')});
      return ok;
    } catch(e: unknown) { const msg = e instanceof Error ? e.message : String(e); setAiTestResult({ok:false,msg}); return false; } finally { setAiTesting(false); }
  };

  const nextStep = () => {
    if (step===1 && !selectedLang) { setError(t.setupWizard.selectLanguage); return; }
    if (step===2 && !isInvited && !workspaceName.trim()) { setError(t.setupWizard.enterWorkspace); return; }
    if (step===3 && !gender) { setError(t.setupWizard.selectGender); return; }
    setStep(s => isInvited && s===3 ? 6 : s+1); setError(''); setSuccess('');
  };
  const prevStep = () => { setStep(s => { if (isInvited && s===6) return 3; return s-1; }); setError(''); };

  // Commit all wizard data, then advance to Welcome step
  const commitAndWelcome = async () => {
    setSaving(true); setError('');
    try {
      const jobTitle = role==='__custom__' ? customRole : role;
      await authApi.updateProfile({ jobTitle: jobTitle||undefined, skills: skills.length>0 ? skills.join(',') : undefined, gender: gender||undefined, displayName: displayName||undefined, aiLanguage: selectedAiLang||undefined, uiLanguage: selectedLang||undefined, onboardingCompleted: true });
      if (!isInvited && smtp.host && !skippedSmtp) { await smtpApi.updateConfig(smtp); }
      if (!isInvited && aiEnabled) { await configApi.updateLlmConfig({ backend:aiBackend, ollamaBaseUrl:aiOllamaUrl, ollamaFlashModel:aiFlashModel||undefined, ollamaProModel:aiProModel||undefined, embeddingModel:aiEmbedModel||undefined, cloudProvider:aiCloudProvider, cloudBaseUrl:aiCloudUrl, cloudApiKey:aiCloudKey||undefined, cloudFlashModel:aiCloudFlash, cloudProModel:aiCloudPro, flashTimeout:Number(aiFlashTimeout), proTimeout:Number(aiProTimeout) }); }
      // Welcome shown only after all saves succeed. In a no-AI build the AI
      // step is omitted, so the wizard ends right after SMTP (step 5).
      setStep(isInvited ? 6 : (aiEnabled ? 6 : 5));
    } catch(err:unknown) {
      setError(err instanceof Error ? err.message : t.setupWizard.saveFailed);
    } finally { setSaving(false); }
  };

  // Finish — logout (data already saved in commitAndWelcome), go to login
  const finishAndLogout = async () => {
    try { await authApi.logout(); } catch { /* Logout API call failure — local logout still proceeds */ }
    useAuthStore.getState().logout();
    navigate({ to: '/login' });
  };

  const stepDots = isInvited
    ? [{n:1,label:t.setup.language},{n:2,label:t.setup.personalInfo},{n:3,label:t.setupWizard.profileStep},{n:6,label:t.setup.welcomeStep}]
    : aiEnabled
      ? [{n:1,label:t.setup.language},{n:2,label:t.setup.workspace},{n:3,label:t.setupWizard.profileStep},{n:4,label:t.setupWizard.smtpServer},{n:5,label:t.setup.aiModel},{n:6,label:t.setup.welcomeStep}]
      : [{n:1,label:t.setup.language},{n:2,label:t.setup.workspace},{n:3,label:t.setupWizard.profileStep},{n:4,label:t.setupWizard.smtpServer},{n:5,label:t.setup.welcomeStep}];

  return (
    <div className="h-screen flex flex-col bg-surface-app">
      <div className="text-center py-4 shrink-0">
        <div className="av mx-auto" style={{width:40,height:40,fontSize:18}}>🚀</div>
        <h2 className="text-base font-bold text-ink-primary mt-2">{t.setup.welcome}</h2>
        <p className="text-xs text-ink-muted mt-0.5">{t.setup.subtitle.replace('{n}', String(stepDots.length))}</p>
      </div>

      <div className="flex justify-center gap-2 pb-3 shrink-0">
        {stepDots.map(d => (
          <div key={d.n} className="flex items-center gap-1">
            {d.n>1 && <span className="text-ink-muted text-xs">──</span>}
            <span className="flex items-center justify-center text-xs fw6 rounded-full" style={{width:22,height:22,background:d.n<=step?'hsl(var(--brand))':'hsl(var(--edge-default))',color:d.n<=step?'hsl(var(--brand-text))':'hsl(var(--ink-muted))'}}>{d.n}</span>
            <span className={`text-xs fw6 ${d.n<=step?'text-brand-main':'text-ink-muted'}`}>{d.label}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <Card className="mx-auto" style={{maxWidth:560}}><CardContent className="p-5">
          {error && <div className="mb-3 p-2.5 rounded-card text-xs text-danger bg-danger-soft border border-danger/20">{error}</div>}
          {success && <div className="mb-3 p-2.5 rounded-card text-xs text-success bg-success-soft">{success}</div>}

          {/* Step 1 — Language */}
          {step===1 && (<div>
            <h3 className="text-sm fw6 text-ink-primary mb-1">{t.setup.uiLanguage}</h3>
            <p className="text-xs text-ink-muted mb-3">{t.setup.uiLanguageDesc}</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {languageList.map(l=>(<button key={l.key} type="button" className={cn('flex flex-col items-center gap-2 py-4 px-3 rounded-card border transition-colors',selectedLang===l.key?'border-brand-main bg-brand-soft text-brand-main':'border-edge text-ink-secondary hover:border-edge-hover')} onClick={()=>{const k=l.key as Lang; setSelectedLang(k); setLang(k);}}><span className="text-2xl">{l.icon}</span><span className="text-sm fw6">{l.value}</span></button>))}
            </div>
            <h3 className="text-sm fw6 text-ink-primary mb-1">{t.setup.aiLanguage}</h3>
            <p className="text-xs text-ink-muted mb-3">{t.setup.aiLanguageDesc}</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {languageList.map(l=>(<button key={l.key} type="button" className={cn('flex flex-col items-center gap-2 py-4 px-3 rounded-card border transition-colors',selectedAiLang===l.key?'border-brand-main bg-brand-soft text-brand-main':'border-edge text-ink-secondary hover:border-edge-hover')} onClick={()=>setSelectedAiLang(l.key)}><span className="text-2xl">{l.icon}</span><span className="text-sm fw6">{l.value}</span></button>))}
            </div>
            <div className="flex justify-end"><Button onClick={nextStep}>{t.setup.next}</Button></div>
          </div>)}

          {/* Step 2 — Workspace / Personal Info */}
          {step===2 && (<div>
            {!isInvited && (<div className="mb-3"><h3 className="text-sm fw6 text-ink-primary mb-1">{t.setupWizard.nameWorkspace}</h3><p className="text-xs text-ink-muted mb-2">{t.setup.workspaceDesc}</p><div className="form-grp"><label className="form-label">{t.setup.workspaceName}</label><input className="form-input" value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} placeholder={t.setupWizard.workspacePlaceholder}/></div></div>)}
            {isInvited && (<div className="mb-3"><h3 className="text-sm fw6 text-ink-primary mb-1">{t.setup.personalInfo}</h3><p className="text-xs text-ink-muted mb-2">{t.setup.personalInfoDesc}</p><div className="form-grp"><label className="form-label">{t.setupWizard.displayName}</label><input className="form-input" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder={t.setupWizard.displayNamePlaceholder}/></div></div>)}
            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={prevStep}>{t.setup.back}</Button>
              <Button onClick={nextStep}>{t.setup.next}</Button>
            </div>
          </div>)}

          {/* Step 3 — Profile */}
          {step===3 && (<div>
            <h3 className="text-sm fw6 text-ink-primary mb-1">{t.setupWizard.profileTitle}</h3>
            <p className="text-xs text-ink-muted mb-3">{t.setupWizard.profileDesc}</p>
            <div className="mb-3"><label className="form-label">{t.setup.gender}</label>
              <div className="flex gap-2">{GENDERS.map(g=>(<button key={g.key} type="button" onClick={()=>setGender(g.key)} className={cn('flex flex-col items-center gap-0.5 py-2.5 px-3 rounded-btn border text-xs transition-colors',gender===g.key?'border-brand-main bg-brand-soft text-brand-main':'border-edge text-ink-muted hover:border-edge-hover')} style={{minWidth:80}}><span className="text-lg">{g.icon}</span><span>{g.label}</span></button>))}</div>
            </div>
            <div className="mb-3"><label className="form-label">{t.setup.jobTitle}</label><p className="text-xs text-ink-muted mb-2">{t.setup.jobTitleDesc}</p>
              <div className="grid grid-cols-2 gap-1.5">{ROLES.map(r=>(<button key={r.key} type="button" onClick={()=>setRole(r.key)} className={cn('flex items-center gap-2 py-2 px-2.5 rounded-btn text-xs text-left transition-colors',role===r.key?'border border-brand-main bg-brand-soft text-ink-primary':'border border-edge text-ink-secondary hover:border-edge-hover',r.key==='__custom__'&&'border-dashed')}><span className="text-base">{r.icon}</span><span className="fw6">{r.key==='__custom__'?t.setupWizard.customRole:roleLabels[r.key]||r.key}</span></button>))}</div>
              {role==='__custom__'&&<input className="form-input mt-1.5" placeholder={t.setupWizard.jobTitlePlaceholder} value={customRole} onChange={e=>setCustomRole(e.target.value)}/>}
            </div>
            <div className="mb-3"><label className="form-label">{t.setup.skills}</label><p className="text-xs text-ink-muted mb-2">{t.setup.skillsDesc}</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {skills.map(sk=>{const info=skillList.find(s=>s.key===sk); return(<button key={sk} type="button" onClick={()=>setSkills(p=>p.filter(s=>s!==sk))} className="text-xs rounded px-2 py-0.5 border bg-brand-main text-brand-text border-brand-main">{info?info.value:sk} <span className="ml-0.5 opacity-60">×</span></button>);})}
                {skillList.filter(s=>!skills.includes(s.key)).map(sk=>(<button key={sk.key} type="button" onClick={()=>setSkills(p=>[...p,sk.key])} className="text-xs rounded px-2 py-0.5 border bg-surface-card text-ink-secondary border-edge hover:border-edge-hover transition-colors">{sk.value}</button>))}
              </div>
              <div className="flex gap-1.5">
                <input className="form-input flex-1" style={{padding:'4px 8px',fontSize:12}} placeholder={t.setup.otherSkills} value={customSkill} onChange={e=>setCustomSkill(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&customSkill.trim()){e.preventDefault();setSkills(p=>p.includes(customSkill.trim())?p:[...p,customSkill.trim()]);setCustomSkill('');}}}/>
                <Button variant="secondary" size="sm" onClick={()=>{if(customSkill.trim()){setSkills(p=>p.includes(customSkill.trim())?p:[...p,customSkill.trim()]);setCustomSkill('');}}}>{t.setup.add}</Button>
              </div>
            </div>
            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={prevStep}>{t.setup.back}</Button>
              <Button onClick={isInvited ? commitAndWelcome : nextStep} loading={isInvited ? saving : false}>
                {isInvited ? t.setup.save : t.setup.next}
              </Button>
            </div>
          </div>)}

          {/* Step 4 — SMTP Server (full only) */}
          {!isInvited && step===4 && (<div>
            <h3 className="text-sm fw6 text-ink-primary mb-1">{t.setup.smtpTitle}</h3>
            <p className="text-xs text-ink-muted mb-3">{t.setup.smtpDesc}</p>
            <div className="flex gap-1.5 mb-3">{SMTP_PRESETS.map(p=>(<button key={p.name} className={cn('btn-secondary btn-xs', smtpProvider===p.name && 'btn-brand')} onClick={()=>{setSmtpProvider(p.name);setSmtp({...smtp,host:p.host,port:p.port,starttls:p.starttls});}}>{presetLabels[p.name]||p.name}</button>))}</div>
            {/* ─── Auth code guide ─── */}
            {smtpProvider && smtpProvider !== 'Custom' && (()=>{const gw=t.setupWizard as any;const guideKey='guide'+smtpProvider.replace(' ','');const steps=gw[guideKey];return steps?<div className="rounded-card border p-2.5 mb-3 bg-amber-50/30"><p className="text-xs fw6 text-amber-700 mb-1.5">🔑 {smtpProvider} {(t.setupWizard as any).guideStep || 'Step'}：</p><ol className="text-xs text-ink-muted" style={{paddingLeft:18,margin:0}}>{steps.map((s:string,i:number)=><li key={i} className="mb-0.5">{s}</li>)}</ol></div>:null})()}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="form-grp"><label className="form-label">{t.setupWizard.smtpHost}</label><input className="form-input" value={smtp.host} onChange={e=>setSmtp({...smtp,host:e.target.value})} placeholder="smtp.gmail.com"/></div>
              <div className="form-grp"><label className="form-label">{t.setupWizard.port}</label><input className="form-input" type="number" value={smtp.port} onChange={e=>setSmtp({...smtp,port:Number(e.target.value)})}/></div>
              <div className="form-grp"><label className="form-label">{t.setupWizard.username}</label><input className="form-input" value={smtp.username} onChange={e=>setSmtp({...smtp,username:e.target.value})} placeholder="you@gmail.com"/></div>
              <div className="form-grp"><label className="form-label">{t.setupWizard.password}</label><input className="form-input" type="password" autoComplete="off" value={smtp.password} onChange={e=>setSmtp({...smtp,password:e.target.value})} placeholder={t.setupWizard.smtpNote}/></div>
            </div>
            <div className="flex items-center gap-2 mb-3"><input type="checkbox" checked={smtp.starttls} onChange={e=>setSmtp({...smtp,starttls:e.target.checked})} className="accent-brand-main"/><span className="text-xs text-ink-secondary">{t.setupWizard.useStarttls}</span></div>
            <div className="form-grp"><label className="form-label">{t.setupWizard.fromName}</label><input className="form-input" value={smtp.fromName} onChange={e=>setSmtp({...smtp,fromName:e.target.value})}/></div>
            <Button variant="secondary" className="w-full mb-2" size="sm" onClick={testSmtp} loading={smtpTesting}>{t.setup.smtpTest}</Button>
            {smtpTestMsg && <p className={`text-xs mb-2 ${smtpTestMsg===t.setupWizard.connectionOk?'text-success':'text-danger'}`}>{smtpTestMsg}</p>}
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="ghost" onClick={prevStep}>{t.setup.back}</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={()=>{ setSkippedSmtp(true); if (aiEnabled) setStep(5); else commitAndWelcome(); }}>{t.setup.skip}</Button>
                <Button onClick={async()=>{
                  setSkippedSmtp(false);
                  if(smtp.host){
                    if(!smtp.username || !smtp.password) { setError(t.setupWizard.usernamePasswordRequired); return; }
                    setSmtpNextLoading(true); setSmtpTestMsg('');
                    try {
                      const r = await smtpApi.testConnection(smtp);
                      const d2 = r.data; const ok = typeof d2.data === 'string' && d2.data.includes('successful');
                      if (!ok) { setError(t.setupWizard.smtpTestFailed); setSmtpNextLoading(false); return; }
                      setError('');
                    } catch {
                      setError(t.setupWizard.smtpTestFailed);
                      setSmtpNextLoading(false); return;
                    }
                    setSmtpNextLoading(false);
                  }
                  // No-AI build has no AI-model step → finish straight from SMTP.
                  if (aiEnabled) setStep(5); else await commitAndWelcome();
                }} loading={smtpNextLoading}>{smtpNextLoading?t.setupWizard.testing:t.setup.next}</Button>
              </div>
            </div>
          </div>)}

          {/* Step 5 — AI Model (AI-enabled builds only) */}
          {!isInvited && step===5 && aiEnabled && (<div>
            <h3 className="text-sm fw6 text-ink-primary mb-1">{t.setup.aiTitle} <span className="badge tag-hi ml-1">{t.setup.aiTitleRequired}</span></h3>
            <p className="text-xs text-ink-muted mb-2">{t.setup.aiDesc}</p>
            {/* Radio buttons on one line */}
            <div className="flex gap-3 mb-3">
              <label className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-btn border cursor-pointer text-xs',aiBackend==='ollama'?'border-brand-main bg-brand-soft text-brand-main':'border-edge text-ink-muted')}>
                <input type="radio" name="ai" className="accent-brand-main" checked={aiBackend==='ollama'} onChange={()=>setAiBackend('ollama')}/>🖥 {t.setupWizard.localOllama}
              </label>
              <label className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-btn border cursor-pointer text-xs',aiBackend==='cloud'?'border-brand-main bg-brand-soft text-brand-main':'border-edge text-ink-muted')}>
                <input type="radio" name="ai" className="accent-brand-main" checked={aiBackend==='cloud'} onChange={()=>setAiBackend('cloud')}/>☁️ {t.setupWizard.cloudApi}
              </label>
            </div>
            {/* Ollama fields */}
            {aiBackend==='ollama' && <div className="rounded-card border p-2.5 mb-2">
              <div className="form-grp"><label className="form-label">{t.setupWizard.serverAddress}</label><input className="form-input" value={aiOllamaUrl} onChange={e=>setAiOllamaUrl(e.target.value)}/></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="form-grp"><label className="form-label">{t.setupWizard.quickTasksModel}</label><select className="form-select" value={aiFlashModel} onChange={e=>setAiFlashModel(e.target.value)}><option value="">{t.setupWizard.select}</option>{[...new Map([...ollamaModelList,...ollamaModels.map(m=>({key:m,value:m}))].map(x=>[x.key,x])).values()].map(m=><option key={m.key} value={m.key}>{m.value}</option>)}</select><div className="flex items-center gap-2 mt-1"><span className="text-xs text-ink-muted">{t.setupWizard.timeout}</span><select className="form-select" value={aiFlashTimeout} onChange={e=>setAiFlashTimeout(e.target.value)} style={{padding:'4px 6px',fontSize:12}}>{timeoutList.map(t=>{const timeoutKey=t.key;return <option key={timeoutKey} value={timeoutKey}>{t.value}</option>;})}</select></div></div>
                <div className="form-grp"><label className="form-label">{t.setupWizard.heavyTasksModel}</label><select className="form-select" value={aiProModel} onChange={e=>setAiProModel(e.target.value)}><option value="">{t.setupWizard.select}</option>{[...new Map([...ollamaModelList,...ollamaModels.map(m=>({key:m,value:m}))].map(x=>[x.key,x])).values()].map(m=><option key={m.key} value={m.key}>{m.value}</option>)}</select><div className="flex items-center gap-2 mt-1"><span className="text-xs text-ink-muted">{t.setupWizard.timeout}</span><select className="form-select" value={aiProTimeout} onChange={e=>setAiProTimeout(e.target.value)} style={{padding:'4px 6px',fontSize:12}}>{timeoutList.map(t=>{const timeoutKey=t.key;return <option key={timeoutKey} value={timeoutKey}>{t.value}</option>;})}</select></div></div>
              </div>
            </div>}
            {/* Cloud fields */}
            {aiBackend==='cloud' && <div className="rounded-card border p-2.5 mb-2">
              <div className="form-grp"><label className="form-label">{t.setupWizard.provider}</label><select className="form-select w-full" value={aiCloudProvider} onChange={e=>{setAiCloudProvider(e.target.value);const urls:Record<string,string>={deepseek:'https://api.deepseek.com/v1',openai:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com',moonshot:'https://api.moonshot.cn/v1',dashscope:'https://dashscope.aliyuncs.com/compatible-mode/v1'};setAiCloudUrl(urls[e.target.value]||'');}}><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="moonshot">Kimi (Moonshot)</option><option value="dashscope">Qwen (DashScope)</option><option value="anthropic">Anthropic</option><option value="custom">{t.setupWizard.custom}</option></select></div>
              <div className="form-grp"><label className="form-label">{t.setupWizard.baseUrl}</label><input className="form-input" value={aiCloudUrl} onChange={e=>setAiCloudUrl(e.target.value)} placeholder="https://api.deepseek.com/v1"/></div>
              <div className="form-grp"><label className="form-label">{t.setupWizard.apiKey}</label><input className="form-input" type="password" autoComplete="off" value={aiCloudKey} onChange={e=>setAiCloudKey(e.target.value)} placeholder="sk-…"/></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="form-grp"><label className="form-label">{t.setupWizard.quickTasksModel}</label><select className="form-select" value={aiCloudFlash} onChange={e=>setAiCloudFlash(e.target.value)}><option value="">{t.setupWizard.select}</option>{cloudModelList.map(m=><option key={m.key} value={m.key}>{m.value}</option>)}</select><div className="flex items-center gap-2 mt-1"><span className="text-xs text-ink-muted">{t.setupWizard.timeout}</span><select className="form-select" value={aiFlashTimeout} onChange={e=>setAiFlashTimeout(e.target.value)} style={{padding:'4px 6px',fontSize:12}}>{timeoutList.map(t=>{const timeoutKey=t.key;return <option key={timeoutKey} value={timeoutKey}>{t.value}</option>;})}</select></div></div>
                <div className="form-grp"><label className="form-label">{t.setupWizard.heavyTasksModel}</label><select className="form-select" value={aiCloudPro} onChange={e=>setAiCloudPro(e.target.value)}><option value="">{t.setupWizard.select}</option>{cloudModelList.map(m=><option key={m.key} value={m.key}>{m.value}</option>)}</select><div className="flex items-center gap-2 mt-1"><span className="text-xs text-ink-muted">{t.setupWizard.timeout}</span><select className="form-select" value={aiProTimeout} onChange={e=>setAiProTimeout(e.target.value)} style={{padding:'4px 6px',fontSize:12}}>{timeoutList.map(t=>{const timeoutKey=t.key;return <option key={timeoutKey} value={timeoutKey}>{t.value}</option>;})}</select></div></div>
              </div>
            </div>}
            {/* Embedding Model */}
            <div className="rounded-card border p-2.5 mb-2">
              <div className="form-grp"><label className="form-label">{t.setupWizard.searchModel}</label><select className="form-select" value={aiEmbedModel} onChange={e=>setAiEmbedModel(e.target.value)}><option value="">{t.setupWizard.select}</option>{embedOptions.map(m=><option key={m.key} value={m.key}>{m.value}</option>)}</select></div>
            </div>
            <Button variant="secondary" className="w-full mb-2" size="sm" onClick={testAi} loading={aiTesting}>{t.setup.aiTest}</Button>
            {aiTestResult && <p className={`text-xs mb-2 ${aiTestResult.ok?'text-success':'text-danger'}`}>{aiTestResult.msg}</p>}
            <div className="flex justify-between gap-2 pt-1"><Button variant="ghost" onClick={prevStep}>{t.setup.back}</Button><Button onClick={async()=>{
              setAiSaveLoading(true);
              try {
                const r = await configApi.testConnection({
                  backend: aiBackend, ollamaBaseUrl: aiOllamaUrl,
                  ollamaFlashModel: aiFlashModel, ollamaProModel: aiProModel, embeddingModel: aiEmbedModel,
                  cloudBaseUrl: aiCloudUrl, cloudApiKey: aiCloudKey, cloudFlashModel: aiCloudFlash, cloudProModel: aiCloudPro,
                }, { timeout: (Math.max(Number(aiFlashTimeout), Number(aiProTimeout), 60) + 30) * 1000 });
                const raw2 = ((r.data as Record<string, unknown>).data as string || '').split(';').map(function(s){return s.trim()}).filter(Boolean);
                const failures2 = raw2.filter(function(s){return s.includes('failed')||s.includes('not set')||s.includes('not found')});
                if (failures2.length > 0) { setAiTestResult({ok:false,msg:failures2.join('; ')}); setAiSaveLoading(false); return; }
              } catch(e: unknown) { const msg = e instanceof Error ? e.message : String(e); setAiTestResult({ok:false,msg}); setAiSaveLoading(false); return; }
              setAiSaveLoading(false);
              commitAndWelcome();
            }} loading={aiSaveLoading || saving}>{aiSaveLoading?t.setupWizard.testing:saving?t.setupWizard.saving:t.setupWizard.finishBtn}</Button></div>
          </div>)}

          {/* Step 6/5 — Welcome (5 in a no-AI build, where the AI step is omitted) */}
          {step === (isInvited ? 6 : (aiEnabled ? 6 : 5)) && (<div className="text-center py-2">
            <p className="text-5xl mb-2">🎉</p><h2 className="text-base fw7 text-ink-primary mb-1">{isInvited?t.setup.profileComplete:t.setup.allSet}</h2>
            <p className="text-xs text-ink-muted mb-4">{isInvited?t.setup.profileCompleteDesc:t.setup.allSetDesc}</p>
            <div className="text-left card p-3 mb-4 text-xs">
              {!isInvited&&<div className="flex justify-between mb-1"><span className="text-ink-muted">{t.setup.summaryWorkspace}</span><span className="fw6 text-ink-primary">{workspaceName||currentTenant?.name}</span></div>}
              <div className="flex justify-between mb-1"><span className="text-ink-muted">{t.setup.summaryJobTitle}</span><span className="fw6 text-ink-primary">{role==='__custom__'?customRole:role}</span></div>
              <div className="flex justify-between mb-1"><span className="text-ink-muted">{t.setup.summaryGender}</span><span className="fw6 text-ink-primary">{genderLabels[gender]||gender}</span></div>
              <div className="flex justify-between mb-1"><span className="text-ink-muted">{t.setup.summarySkills}</span><span className="fw6 text-ink-primary">{skills.length>0?skills.join(', '):t.setup.summaryNone}</span></div>
              {isInvited&&<div className="flex justify-between mb-1"><span className="text-ink-muted">{t.setup.summaryDisplayName}</span><span className="fw6 text-ink-primary">{displayName}</span></div>}
              {!isInvited&&<div className="flex justify-between mb-1"><span className="text-ink-muted">{t.setup.summaryEmail}</span><span className="fw6 text-ink-primary">{smtp.host||t.setup.summarySkipped}</span></div>}
              {!isInvited&&aiEnabled&&<div className="flex justify-between"><span className="text-ink-muted">{t.setup.summaryAi}</span><span className="fw6 text-ink-primary">{aiBackend==='ollama'?t.setupWizard.backendOllama:t.setupWizard.backendCloud}</span></div>}
            </div>
            <div><Button size="lg" onClick={finishAndLogout} loading={saving}>{saving?t.setupWizard.finishing:t.setupWizard.finishBtn}</Button></div>
          </div>)}

        </CardContent></Card>
      </div>
    </div>
  );
}
