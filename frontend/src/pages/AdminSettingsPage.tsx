import { useState, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { aiEnabled } from '@/lib/aiGate';
import { authApi } from '@/api/authApi';
import { configApi } from '@/api/configApi';
import { masterDataApi } from '@/api/masterDataApi';
import { useAuthStore } from '@/stores/authStore';
import { smtpApi, type SmtpConfig } from '@/api/aiApi';
import { dbConfigApi, type DbConfig } from '@/api/dbConfigApi';
import { useT } from '@/i18n/useT';

type TabKey = 'ai' | 'smtp' | 'db';

// Fallback if master_data ai_language fails to load (matches the 017 seed).
const DEFAULT_AI_LANGS = [
  { key: 'en', value: 'English', icon: '🇺🇸' },
  { key: 'zh', value: '简体中文', icon: '🇨🇳' },
  { key: 'ja', value: '日本語', icon: '🇯🇵' },
];

export function AdminSettingsPage() {
  // In a no-AI build there is no AI-model tab — land on SMTP instead.
  const [tab, setTab] = useState<TabKey>(aiEnabled ? 'ai' : 'smtp');
  const t = useT();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ─── AI Config ───
  const [aiBackend, setAiBackend] = useState('ollama');
  const [aiOllamaUrl, setAiOllamaUrl] = useState('http://localhost:11434');
  const [aiFlashModel, setAiFlashModel] = useState('');
  const [aiProModel, setAiProModel] = useState('');
  const [aiEmbedModel, setAiEmbedModel] = useState('');
  const [aiCloudKey, setAiCloudKey] = useState('');
  const [aiCloudProvider, setAiCloudProvider] = useState('deepseek');
  const [aiCloudUrl, setAiCloudUrl] = useState('https://api.deepseek.com');
  const [aiCloudFlash, setAiCloudFlash] = useState('deepseek-v4-flash');
  const [aiCloudPro, setAiCloudPro] = useState('deepseek-v4-pro');
  const [aiFlashTimeout, setAiFlashTimeout] = useState('120');
  const [aiProTimeout, setAiProTimeout] = useState('300');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [serviceEnabled, setServiceEnabled] = useState(true);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [aiLanguage, setAiLanguage] = useState(useAuthStore.getState().user?.aiLanguage || 'en');
  const [languageList, setLanguageList] = useState<Array<{key:string;value:string;icon:string}>>([]);
  const [embeddingModelList, setEmbeddingModelList] = useState<Array<{key:string;value:string}>>([]);

  // ─── SMTP Config ───
  const [smtp, setSmtp] = useState<SmtpConfig>({ host: '', port: 587, username: '', password: '', starttls: true, fromName: '' });
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestMsg, setSmtpTestMsg] = useState('');
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  // ─── DB Config ───
  const [dbConfig, setDbConfig] = useState<DbConfig>({ host: '', port: 5432, databaseName: '', username: '', password: '' });
  const [dbServiceRunning, setDbServiceRunning] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbTestResult, setDbTestResult] = useState('');
  const [dbTestOk, setDbTestOk] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbSaved, setDbSaved] = useState(false);
  const [dbStopping, setDbStopping] = useState(false);
  const [dbRestarting, setDbRestarting] = useState(false);

  const SMTP_PRESETS = [
    { name: 'Gmail', host: 'smtp.gmail.com', port: 587, starttls: true },
    { name: 'Outlook', host: 'smtp.office365.com', port: 587, starttls: true },
    { name: 'QQ Mail', host: 'smtp.qq.com', port: 587, starttls: true },
    { name: '163 Mail', host: 'smtp.163.com', port: 465, starttls: false },
    { name: '126 Mail', host: 'smtp.126.com', port: 465, starttls: false },
  ];

  useEffect(() => {
    if (aiEnabled) {
      configApi.getLlmConfig().then(r => {
        const cfg = (r.data as { data: Record<string,string> }).data || {};
        if (cfg.backend) setAiBackend(cfg.backend);
        if (cfg.ollamaBaseUrl) setAiOllamaUrl(cfg.ollamaBaseUrl);
        if (cfg.ollamaFlashModel) setAiFlashModel(cfg.ollamaFlashModel);
        if (cfg.ollamaProModel) setAiProModel(cfg.ollamaProModel);
        if (cfg.embeddingModel) setAiEmbedModel(cfg.embeddingModel);
        if (cfg.cloudProvider) setAiCloudProvider(cfg.cloudProvider);
        if (cfg.cloudBaseUrl) setAiCloudUrl(cfg.cloudBaseUrl);
        if (cfg.cloudApiKey) setAiCloudKey(cfg.cloudApiKey);
        if (cfg.cloudFlashModel) setAiCloudFlash(cfg.cloudFlashModel);
        if (cfg.cloudProModel) setAiCloudPro(cfg.cloudProModel);
        if (cfg.flashTimeout) setAiFlashTimeout(String(cfg.flashTimeout));
        if (cfg.proTimeout) setAiProTimeout(String(cfg.proTimeout));
        if (cfg.serviceEnabled !== undefined && cfg.serviceEnabled !== null) setServiceEnabled(Boolean(cfg.serviceEnabled));
      }).catch(()=>{});
      configApi.getModels().then(r => {
        setOllamaModels(((r.data as { models: string[] }).models) || []);
      }).catch(()=>{});
      masterDataApi.list('ai_language').then(res => {
        setLanguageList((res.data.data as Array<{key:string;value:string;icon:string}>) || []);
      }).catch(()=>{});
      masterDataApi.list('ai_embedding_model').then(res => {
        setEmbeddingModelList((res.data.data as Array<{key:string;value:string}>) || []);
      }).catch(()=>{});
    }
    smtpApi.getConfig().then(r => {
      const d = r.data.data;
      if (d?.config) setSmtp(d.config);
      if (d?.is_configured) setSmtpConfigured(d.is_configured);
    }).catch(()=>{});
    dbConfigApi.get().then(r => {
      const cfg = (r.data as Record<string, unknown>).data as DbConfig | null;
      if (cfg) {
        setDbConfig({ host: cfg.host || '', port: cfg.port || 5432, databaseName: cfg.databaseName || '', username: cfg.username || '', password: '' });
        setDbServiceRunning(cfg.serviceStatus === 'running');
      }
    }).catch(() => {});
  }, []);

  const testAiConnection = async (): Promise<boolean> => {
    if (aiBackend==="ollama") {
      if(!aiOllamaUrl) { setTestResult({ok:false,msg:t.admin.serverAddressRequired}); return false; }
      if(!aiFlashModel) { setTestResult({ok:false,msg:t.admin.quickTasksModelRequired}); return false; }
      if(!aiProModel) { setTestResult({ok:false,msg:t.admin.heavyTasksModelRequired}); return false; }
    } else {
      if(!aiCloudKey) { setTestResult({ok:false,msg:t.admin.apiKeyRequired}); return false; }
      if(!aiCloudUrl) { setTestResult({ok:false,msg:t.admin.baseUrlRequired}); return false; }
      if(!aiCloudFlash) { setTestResult({ok:false,msg:t.admin.quickTasksModelRequired}); return false; }
      if(!aiCloudPro) { setTestResult({ok:false,msg:t.admin.heavyTasksModelRequired}); return false; }
    }
    if(!aiEmbedModel) { setTestResult({ok:false,msg:t.admin.embeddingModelRequired}); return false; }
    setTesting(true); setTestResult(null);
    try {
      const r = await configApi.testConnection({
        backend: aiBackend, ollamaBaseUrl: aiOllamaUrl,
        ollamaFlashModel: aiFlashModel, ollamaProModel: aiProModel, embeddingModel: aiEmbedModel,
        cloudBaseUrl: aiCloudUrl, cloudApiKey: aiCloudKey, cloudFlashModel: aiCloudFlash, cloudProModel: aiCloudPro,
      });
      const raw = ((r.data as Record<string, unknown>).data as string || "").split(';').map(s => s.trim()).filter(Boolean);
      const failures = raw.filter(s => s.includes('failed') || s.includes('not set') || s.includes('not found'));
      const ok = failures.length === 0;
      setTestResult({ ok, msg: ok ? t.admin.connectionOk : failures.join('; ') });
      return ok;
    } catch(e: unknown) { const msg = e instanceof Error ? e.message : String(e); setTestResult({ ok: false, msg }); return false; }
    finally { setTesting(false); }
  };

  const handleTest = () => tab === 'ai' ? testAiConnection() : testSmtpConnection();
  const handleSave = () => tab === 'ai' ? saveAi() : saveSmtp();

  const testSmtpConnection = async () => {
    setSmtpTesting(true); setSmtpTestMsg(''); setSmtpSaved(false);
    try {
      const r = await smtpApi.testConnection(smtp);
      const d = r.data.data; const ok = typeof d === 'string' && d.includes('successful');
      setSmtpTestMsg(ok ? t.admin.connectionOk : t.admin.dbConnFail);
    } catch { setSmtpTestMsg(t.admin.dbConnFail); }
    setSmtpTesting(false);
  };

  const saveSmtp = async () => {
    if (smtp.host && (!smtp.username || !smtp.password)) { setSmtpTestMsg('Username and Password are required.'); return; }
    if (smtp.host) {
      setSmtpTesting(true); setSmtpTestMsg('Testing…');
      try {
        const r = await smtpApi.testConnection(smtp);
        const d2 = r.data.data; const ok = typeof d2 === 'string' && d2.includes('successful');
        if (!ok) { setSmtpTestMsg('Test failed. Settings not saved.'); setSmtpTesting(false); return; }
      } catch { setSmtpTestMsg('Test failed. Settings not saved.'); setSmtpTesting(false); return; }
      setSmtpTesting(false);
    }
    await smtpApi.updateConfig(smtp); setSmtpSaved(true); setSmtpConfigured(true); setSmtpTestMsg('');
    setTimeout(() => setSmtpSaved(false), 2000);
  };

  const saveAi = async () => {
    // Step 1: Validate fields
    if (aiBackend==="ollama") {
      if(!aiOllamaUrl) { setTestResult({ok:false,msg:t.admin.serverAddressRequired}); return; }
      if(!aiFlashModel) { setTestResult({ok:false,msg:t.admin.quickTasksModelRequired}); return; }
      if(!aiProModel) { setTestResult({ok:false,msg:t.admin.heavyTasksModelRequired}); return; }
    } else {
      if(!aiCloudKey) { setTestResult({ok:false,msg:t.admin.apiKeyRequired}); return; }
      if(!aiCloudUrl) { setTestResult({ok:false,msg:t.admin.baseUrlRequired}); return; }
      if(!aiCloudFlash) { setTestResult({ok:false,msg:t.admin.quickTasksModelRequired}); return; }
      if(!aiCloudPro) { setTestResult({ok:false,msg:t.admin.heavyTasksModelRequired}); return; }
    }
    if(!aiEmbedModel) { setTestResult({ok:false,msg:t.admin.embeddingModelRequired}); return; }

    // Step 2: Test connection silently (save button shows progress, not test button)
    setSaving(true); setSaved(false); setTestResult(null);
    try {
      const r = await configApi.testConnection({
        backend: aiBackend, ollamaBaseUrl: aiOllamaUrl,
        ollamaFlashModel: aiFlashModel, ollamaProModel: aiProModel, embeddingModel: aiEmbedModel,
        cloudBaseUrl: aiCloudUrl, cloudApiKey: aiCloudKey, cloudFlashModel: aiCloudFlash, cloudProModel: aiCloudPro,
      });
      const raw = ((r.data as Record<string, unknown>).data as string || "").split(';').map(s => s.trim()).filter(Boolean);
      const failures = raw.filter(s => s.includes('failed') || s.includes('not set') || s.includes('not found'));
      if (failures.length > 0) {
        setTestResult({ ok: false, msg: failures.join('; ') });
        setSaving(false); return;
      }

      // Step 3: Save to DB
      await configApi.updateLlmConfig({
        backend: aiBackend, ollamaBaseUrl: aiOllamaUrl, ollamaFlashModel: aiFlashModel,
        ollamaProModel: aiProModel, embeddingModel: aiEmbedModel, cloudProvider: aiCloudProvider,
        cloudBaseUrl: aiCloudUrl, cloudApiKey: aiCloudKey, cloudFlashModel: aiCloudFlash, cloudProModel: aiCloudPro, flashTimeout: Number(aiFlashTimeout), proTimeout: Number(aiProTimeout),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch(e: unknown) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    }
    finally { setSaving(false); }
  };

  const testDbConnection = async () => {
    setDbTesting(true); setDbTestResult(''); setDbTestOk(false);
    try {
      await dbConfigApi.testConnection(dbConfig);
      setDbTestResult(t.admin.dbConnOk); setDbTestOk(true);
    } catch {
      setDbTestResult(t.admin.dbConnFail); setDbTestOk(false);
    } finally { setDbTesting(false); }
  };

  const saveDbConfig = async () => {
    setDbSaving(true); setDbSaved(false);
    try {
      await dbConfigApi.save(dbConfig);
      setDbSaved(true); setTimeout(() => setDbSaved(false), 3000);
    } catch { /* noop */ } finally { setDbSaving(false); }
  };

  const stopDbService = async () => {
    setDbStopping(true);
    try { await dbConfigApi.stopService(); setDbServiceRunning(false); }
    catch { /* noop */ } finally { setDbStopping(false); }
  };

  const restartDbService = async () => {
    setDbRestarting(true);
    try { await dbConfigApi.restartService(); }
    catch { /* connection lost during restart — expected */ }
    // Poll for reconnect
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const r = await dbConfigApi.getStatus();
        if (r.status === 200) { setDbServiceRunning(true); setDbRestarting(false); clearInterval(poll); }
      } catch { /* still down */ }
      if (attempts > 20) { setDbRestarting(false); clearInterval(poll); }
    }, 3000);
  };

  const isOwner = useAuthStore.getState().currentTenant?.role === 'owner';
  const TABS: { key: TabKey; label: string }[] = [
    ...(aiEnabled ? [{ key: 'ai' as TabKey, label: '🤖 ' + t.admin.aiTab }] : []),
    { key: 'smtp', label: '📧 ' + t.admin.smtpTab },
    ...(isOwner ? [{ key: 'db' as TabKey, label: '🗄️ ' + t.admin.dbTab }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="ch">
        <div>
          <h2 className="text-base font-semibold text-ink-primary">{t.admin.title}</h2>
          <p className="text-xs text-ink-muted mt-0.5">{t.admin.subtitle}</p>
        </div>
        <div className="flex gap-2 items-center">
          {testResult && tab === 'ai' && <span className={cn('text-xs', testResult.ok ? 'text-success' : 'text-danger')}>{testResult.msg}</span>}
          {smtpTestMsg && tab === 'smtp' && <span className={cn('text-xs', smtpTestMsg.includes('successful') ? 'text-success' : 'text-danger')}>{smtpTestMsg}</span>}
          {saved && tab === 'ai' && <span className="text-xs text-success">{t.admin.saved}</span>}
          {smtpSaved && tab === 'smtp' && <span className="text-xs text-success">{t.admin.saved}</span>}
          <button className="btn-secondary text-xs" onClick={handleTest} disabled={testing || smtpTesting}>
            {testing ? t.admin.testing : smtpTesting ? t.admin.testing : t.admin.testConnection}
          </button>
          <button className="btn-brand" onClick={handleSave} disabled={saving}>
            {saving ? t.admin.saving : t.admin.saveChanges}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 px-6 border-b border-edge">
        {TABS.map(t => (
          <button key={t.key}
            style={{
              padding: '10px 16px', background: 'transparent', border: 'none',
              borderBottom: tab === t.key ? '2px solid hsl(var(--brand))' : '2px solid transparent',
              color: tab === t.key ? 'hsl(var(--brand))' : 'hsl(var(--ink-muted))',
              fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '13px', transition: 'all 0.15s',
            }}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ═══ AI MODEL TAB ═══ */}
        {tab === 'ai' && <AITab />}

        {/* ═══ SMTP TAB ═══ */}
        {tab === 'smtp' && <SmtpTab />}

        {/* ═══ DB TAB ═══ */}
        {tab === 'db' && <DatabaseTab />}

      </div>
    </div>
  );

  // ═══════════════════════════════════════
  // Sub-components for each tab
  // ═══════════════════════════════════════

  function AITab() {
    return (<>
      <div className="card mb-4 p-4" style={{ borderColor: serviceEnabled ? 'hsl(var(--success))' : 'hsl(var(--danger))' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn('w-2.5 h-2.5 rounded-full', serviceEnabled ? 'bg-success' : 'bg-danger')} />
            <span className="text-sm font-semibold text-ink-primary">
              {t.admin.aiService}: <span className={serviceEnabled ? 'text-success' : 'text-danger'}>{serviceEnabled ? t.admin.running : t.admin.stopped}</span>
            </span>
          </div>
          <button className={cn('btn text-xs', serviceEnabled ? 'btn-secondary' : 'btn-brand')}
            onClick={async () => { const ns = !serviceEnabled; await configApi.toggleService(ns); setServiceEnabled(ns); }}>
            {serviceEnabled ? t.admin.stopService : t.admin.startService}
          </button>
        </div>
        {serviceEnabled && <p className="text-xs text-warning mt-2">{t.admin.stopServiceWarning}</p>}
      </div>

      <div className="card mb-4 p-4" style={{ opacity: serviceEnabled ? 0.5 : 1, pointerEvents: serviceEnabled ? 'none' : 'auto' }}>
        <h3 className="text-sm font-semibold text-ink-primary mb-3">{t.admin.aiModelDeployment}</h3>
        <p className="text-xs text-ink-muted mb-4">{t.admin.deploymentDesc}</p>
        <div className="form-grp mb-4">
          <label className="form-label">{t.admin.deploymentMode}</label>
          <div className="flex gap-3">
            <label className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-btn border cursor-pointer text-xs',aiBackend==='ollama'?'border-brand-main bg-brand-soft text-brand-main':'border-edge text-ink-muted')}>
              <input type="radio" name="aiMode" className="accent-brand-main" checked={aiBackend==='ollama'} onChange={()=>setAiBackend('ollama')}/>🖥 {t.admin.localOllama}
            </label>
            <label className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-btn border cursor-pointer text-xs',aiBackend==='cloud'?'border-brand-main bg-brand-soft text-brand-main':'border-edge text-ink-muted')}>
              <input type="radio" name="aiMode" className="accent-brand-main" checked={aiBackend==='cloud'} onChange={()=>setAiBackend('cloud')}/>☁️ {t.admin.cloudApi}
            </label>
          </div>
        </div>
        {aiBackend === 'ollama' && (<>
          <div className="space-y-3">
            <div className="form-grp"><label className="form-label">{t.admin.serverAddress}</label><input className="form-input" value={aiOllamaUrl} onChange={e => setAiOllamaUrl(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-grp">
                <label className="form-label">{t.admin.quickTasksModel}</label>
                <select className="form-select" value={aiFlashModel} onChange={e => setAiFlashModel(e.target.value)}><option value="">{t.admin.select}</option>{ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
                <div className="flex items-center gap-2 mt-1.5"><span className="text-xs text-ink-muted">{t.admin.timeout}</span><input className="form-input" type="number" value={aiFlashTimeout} onChange={e => setAiFlashTimeout(e.target.value)} style={{width:'64px',padding:'4px 6px',fontSize:'12px'}} /></div>
              </div>
              <div className="form-grp">
                <label className="form-label">{t.admin.heavyTasksModel}</label>
                <select className="form-select" value={aiProModel} onChange={e => setAiProModel(e.target.value)}><option value="">{t.admin.select}</option>{ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}</select>
                <div className="flex items-center gap-2 mt-1.5"><span className="text-xs text-ink-muted">{t.admin.timeout}</span><input className="form-input" type="number" value={aiProTimeout} onChange={e => setAiProTimeout(e.target.value)} style={{width:'64px',padding:'4px 6px',fontSize:'12px'}} /></div>
              </div>
            </div>
          </div>
        </>)}
        {aiBackend === 'cloud' && (<>
          <div className="space-y-3">
            <div className="form-grp"><label className="form-label">{t.admin.provider}</label>
              <select className="form-select" value={aiCloudProvider} onChange={e => { setAiCloudProvider(e.target.value); const urls: Record<string,string> = { deepseek: 'https://api.deepseek.com', openai: 'https://api.openai.com', anthropic: 'https://api.anthropic.com', kimi: 'https://api.moonshot.cn', qwen: 'https://dashscope.aliyuncs.com' }; const models: Record<string,{flash:string,pro:string}> = { deepseek: {flash:'deepseek-v4-flash',pro:'deepseek-v4-pro'}, openai: {flash:'gpt-4o-mini',pro:'gpt-4o'}, anthropic: {flash:'claude-3-5-haiku-latest',pro:'claude-sonnet-4-20250514'}, kimi: {flash:'kimi-k2.6',pro:'kimi-k3'}, qwen: {flash:'qwen-plus',pro:'qwen-max'} }; setAiCloudUrl(urls[e.target.value] || ''); const m = models[e.target.value]; if (m) { setAiCloudFlash(m.flash); setAiCloudPro(m.pro); } }}>
                <option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="kimi">Kimi (Moonshot)</option><option value="qwen">Qwen (DashScope)</option><option value="custom">Custom</option>
              </select>
            </div>
            <div className="form-grp"><label className="form-label">{t.admin.baseUrl}</label><input className="form-input" value={aiCloudUrl} onChange={e => setAiCloudUrl(e.target.value)} placeholder="https://api.deepseek.com" /></div>
            <div className="form-grp"><label className="form-label">{t.admin.apiKey}</label><input className="form-input" type="password" autoComplete="off" value={aiCloudKey} onChange={e => setAiCloudKey(e.target.value)} placeholder="sk-..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-grp">
                <label className="form-label">{t.admin.quickTasksModel}</label>
                <input className="form-input" value={aiCloudFlash} onChange={e => setAiCloudFlash(e.target.value)} />
                <div className="flex items-center gap-2 mt-1.5"><span className="text-xs text-ink-muted">{t.admin.timeout}</span><input className="form-input" type="number" value={aiFlashTimeout} onChange={e => setAiFlashTimeout(e.target.value)} style={{width:'64px',padding:'4px 6px',fontSize:'12px'}} /><span className="text-xs text-ink-muted">s</span></div>
              </div>
              <div className="form-grp">
                <label className="form-label">{t.admin.heavyTasksModel}</label>
                <input className="form-input" value={aiCloudPro} onChange={e => setAiCloudPro(e.target.value)} />
                <div className="flex items-center gap-2 mt-1.5"><span className="text-xs text-ink-muted">{t.admin.timeout}</span><input className="form-input" type="number" value={aiProTimeout} onChange={e => setAiProTimeout(e.target.value)} style={{width:'64px',padding:'4px 6px',fontSize:'12px'}} /><span className="text-xs text-ink-muted">s</span></div>
              </div>
            </div>
          </div>
        </>)}
        {aiBackend === 'vllm' && (
          <div className="space-y-3">
            <div className="form-grp"><label className="form-label">{t.admin.serverAddress}</label><input className="form-input" value={aiOllamaUrl} onChange={e => setAiOllamaUrl(e.target.value)} placeholder="http://localhost:8000" /></div>
          </div>
        )}
        {/* Search Model (Embedding) — always at bottom, both Ollama and Cloud */}
        <div className="form-grp mt-3">
          <label className="form-label">{t.admin.searchModel}</label>
          <select className="form-select" value={aiEmbedModel} onChange={e => setAiEmbedModel(e.target.value)}><option value="">{t.admin.select}</option>{[...new Map([...embeddingModelList, ...ollamaModels.filter(m => /embed|bge|e5|nomic/i.test(m)).map(m => ({key:m.replace(/:latest$/,''), value:m}))].map(x => [x.key, x])).values()].map(m=><option key={m.key} value={m.key}>{m.value}</option>)}</select>
        </div>
      </div>

      {/* AI Output Language */}
      <div className="card mb-4 p-4">
        <h3 className="text-sm font-semibold text-ink-primary mb-2">{t.admin.aiOutputLanguage}</h3>
        <p className="text-xs text-ink-muted mb-3">{t.admin.aiOutputLanguageDesc}</p>
        <div className="flex gap-2">
          {(languageList.length > 0 ? languageList : DEFAULT_AI_LANGS).map(l => (
            <button key={l.key} type="button"
              className={cn('flex items-center gap-1.5 px-4 py-2 rounded-btn border text-sm transition-colors',
                aiLanguage === l.key ? 'border-brand-main bg-brand-soft text-brand-main' : 'border-edge text-ink-secondary hover:border-edge-hover'
              )}
              onClick={async () => { setAiLanguage(l.key); await authApi.updateProfile({ aiLanguage: l.key }); useAuthStore.getState().setAuth({...useAuthStore.getState().user!, aiLanguage: l.key}, {accessToken: useAuthStore.getState().accessToken!, refreshToken: useAuthStore.getState().refreshToken!}); }}>
              <span>{l.icon}</span>
              {l.value}
            </button>
          ))}
        </div>
      </div>
    </>);
  }

  function SmtpTab() {
    const [selectedPreset, setSelectedPreset] = useState('');
    const guideKey = selectedPreset && selectedPreset !== 'Custom' ? 'guide' + selectedPreset.replace(' ', '') : '';
    const guideSteps: string[] = guideKey ? ((t.setupWizard as any)[guideKey]) : null;
    return (
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">{t.admin.smtpEmailServer}</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              {t.admin.smtpDesc}
              {smtpConfigured && <span className="text-success font-medium ml-1">{'— ' + t.admin.connected}</span>}
            </p>
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label">{t.admin.quickSetup}</label>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
            {SMTP_PRESETS.map(p => (
              <button key={p.name} className={cn('btn btn-xs', selectedPreset === p.name ? 'btn-brand' : 'btn-secondary')}
                onClick={() => { setSmtp(prev => ({ ...prev, host: p.host, port: p.port, starttls: p.starttls })); setSelectedPreset(p.name); }}>
                {p.name}
              </button>
            ))}
            <button className="btn-secondary btn-xs" onClick={() => { setSmtp({ host: '', port: 587, username: '', password: '', starttls: true, fromName: '' }); setSelectedPreset(''); }}>{t.admin.custom}</button>
          </div>
        </div>
        {guideSteps && (
          <div className="p-2.5 rounded-card bg-amber-50/30 border border-amber-200/50 mb-3">
            <p className="text-[0.6rem] font-semibold text-amber-700 mb-1">🔑 {selectedPreset} {(t.setupWizard as any).guideStep || 'Step'}：</p>
            <ol className="text-[0.6rem] text-ink-muted" style={{paddingLeft:16,margin:0}}>
              {guideSteps.map((s:string, i:number) => <li key={i} className="mb-0.5">{s}</li>)}
            </ol>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="form-grp"><label className="form-label">{t.admin.smtpHost}</label><input className="form-input" value={smtp.host} onChange={e => setSmtp(p => ({ ...p, host: e.target.value }))} placeholder="smtp.gmail.com" /></div>
          <div className="form-grp"><label className="form-label">{t.admin.port}</label><input className="form-input" type="number" value={smtp.port} onChange={e => setSmtp(p => ({ ...p, port: Number(e.target.value) }))} /></div>
          <div className="form-grp"><label className="form-label">{t.admin.username}</label><input className="form-input" value={smtp.username} onChange={e => setSmtp(p => ({ ...p, username: e.target.value }))} placeholder="you@gmail.com" /></div>
          <div className="form-grp"><label className="form-label">{t.admin.password}</label><input className="form-input" type="password" autoComplete="off" value={smtp.password} onChange={e => setSmtp(p => ({ ...p, password: e.target.value }))} placeholder="App-specific password" /></div>
          <div className="form-grp"><label className="form-label">{t.admin.fromName}</label><input className="form-input" value={smtp.fromName} onChange={e => setSmtp(p => ({ ...p, fromName: e.target.value }))} placeholder="TomiHub" /></div>
          <div className="form-grp flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={smtp.starttls} onChange={e => setSmtp(p => ({ ...p, starttls: e.target.checked }))} style={{ accentColor: 'hsl(var(--brand))' }} />
              <span className="text-xs text-ink-secondary">{t.admin.useSTARTTLS}</span>
            </label>
          </div>
        </div>
      </div>
    );
  }

  function DatabaseTab() {
    const disabled = dbServiceRunning;
    return (
      <>
        {/* Service status card */}
        <div className="card mb-4 p-4" style={{ borderColor: dbServiceRunning ? 'hsl(var(--success))' : 'hsl(var(--danger))' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={cn('w-2.5 h-2.5 rounded-full', dbServiceRunning ? 'bg-success' : 'bg-neutral')} />
              <span className="text-sm font-semibold text-ink-primary">
                {t.admin.dbService}: <span className={dbServiceRunning ? 'text-success' : 'text-ink-muted'}>{dbServiceRunning ? t.admin.running : t.admin.stopped}</span>
              </span>
            </div>
            {dbServiceRunning ? (
              <button className="btn-secondary text-xs" onClick={stopDbService} disabled={dbStopping}>
                {dbStopping ? t.admin.dbStopping : t.admin.dbStopService}
              </button>
            ) : (
              <button className="btn-brand text-xs" onClick={restartDbService} disabled={dbRestarting}>
                {dbRestarting ? t.admin.dbRestarting : t.admin.dbRestartService}
              </button>
            )}
          </div>
        </div>

        {/* Database config form */}
        <div className="card mb-4 p-4" style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
          <h3 className="text-sm font-semibold text-ink-primary mb-3">{t.admin.dbConfig}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-grp"><label className="form-label">{t.admin.dbHost}</label><input className="form-input" value={dbConfig.host} onChange={e => setDbConfig(p => ({ ...p, host: e.target.value }))} placeholder="localhost" /></div>
            <div className="form-grp"><label className="form-label">{t.admin.dbPort}</label><input className="form-input" type="number" value={dbConfig.port} onChange={e => setDbConfig(p => ({ ...p, port: Number(e.target.value) }))} /></div>
            <div className="form-grp"><label className="form-label">{t.admin.dbName}</label><input className="form-input" value={dbConfig.databaseName} onChange={e => setDbConfig(p => ({ ...p, databaseName: e.target.value }))} placeholder="mydb" /></div>
            <div className="form-grp"><label className="form-label">{t.admin.dbUsername}</label><input className="form-input" value={dbConfig.username} onChange={e => setDbConfig(p => ({ ...p, username: e.target.value }))} placeholder="postgres" /></div>
            <div className="form-grp"><label className="form-label">{t.admin.dbPassword}</label><input className="form-input" type="password" autoComplete="off" value={dbConfig.password} onChange={e => setDbConfig(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" /></div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button className="btn-secondary text-xs" onClick={testDbConnection} disabled={dbTesting || disabled}>
            {dbTesting ? t.admin.testing : t.admin.testConnection}
          </button>
          <button className="btn-brand" onClick={saveDbConfig} disabled={dbSaving || disabled}>
            {dbSaving ? t.admin.saving : t.admin.saveChanges}
          </button>
          {dbTestResult && (
            <span className={cn('text-xs', dbTestOk ? 'text-success' : 'text-danger')}>{dbTestResult}</span>
          )}
          {dbSaved && <span className="text-xs text-success">{t.admin.saved}</span>}
          {dbRestarting && <span className="text-xs text-warning">{t.admin.dbRestarting}</span>}
        </div>
      </>
    );
  }
}
