import { useState, useEffect } from 'react';
import { useT } from '@/i18n/useT';
import { apiKeyApi, type ApiKeyData, type GeneratedKey } from '@/api/apiKeyApi';
import { hitlApi, type HitlConfig } from '@/api/hitlApi';

const MCP_TOOLS: Array<{name: string; desc: string; confirm: boolean}> = [
  { name: 'get_issue', desc: 'Get issue details by project key and issue number', confirm: false },
  { name: 'search_issues', desc: 'Search issues by keyword', confirm: false },
  { name: 'update_issue', desc: 'Update issue status/priority', confirm: true },
  { name: 'comment_issue', desc: 'Add comment to an issue', confirm: true },
  { name: 'create_wiki', desc: 'Create a new wiki page', confirm: true },
  { name: 'update_wiki', desc: 'Update an existing wiki page', confirm: true },
  { name: 'search_wiki', desc: 'Search wiki pages by keyword', confirm: false },
];

export function ApiKeysPage() {
  const t = useT();
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState('read,write');
  const [newKeyHitl, setNewKeyHitl] = useState('manual');
  const [generated, setGenerated] = useState<GeneratedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editScopes, setEditScopes] = useState('');

  // Global HITL
  const [hitlConfigs, setHitlConfigs] = useState<HitlConfig[]>([]);
  const globalCfg = hitlConfigs.find(c => c.agentName === null);
  const globalEnabled = globalCfg?.isGlobalEnabled ?? false;
  const globalMode = globalCfg?.mode || 'manual';

  useEffect(() => { loadKeys(); loadHitl(); }, []);

  const loadKeys = () => {
    setLoading(true);
    apiKeyApi.list().then(({ data: resp }) => setKeys(resp.data || [])).finally(() => setLoading(false));
  };
  const loadHitl = () => { hitlApi.list().then(({ data: resp }) => setHitlConfigs(resp.data || [])); };

  const handleGenerate = async () => {
    if (!newKeyName.trim()) return;
    const { data: resp } = await apiKeyApi.generate(newKeyName.trim(), newKeyScopes, newKeyHitl);
    setGenerated(resp.data);
    setNewKeyName(''); setShowGenerate(false);
    loadKeys();
  };
  const handleRevoke = async (id: string) => { await apiKeyApi.revoke(id); loadKeys(); };
  const copyKey = () => { if (generated) { navigator.clipboard.writeText(generated.key); setCopied(true); } };

  const saveGlobal = async (mode: 'manual' | 'auto', enabled: boolean) => {
    await hitlApi.saveGlobal(mode, enabled);
    loadHitl();
  };

  const saveEdit = async () => { setEditingId(null); };

  return (
    <div>
      <div className="ch"><h2 className="text-base font-semibold text-ink-primary">{t.apiKeys.title}</h2></div>
      <div className="p-6" style={{ maxWidth: '800px' }}>

        {/* HITL Global */}
        <div className="card mb-4">
          <div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">{t.apiKeys.hitlTitle}</h3></div>
          <div className="card-bd p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-primary">{t.apiKeys.globalAgent}</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {globalEnabled ? t.apiKeys.globalOnDesc : t.apiKeys.globalOffDesc}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <button className={`btn-xs ${globalMode === 'manual' ? 'bg-warning-soft text-warning font-semibold' : 'btn-ghost'}`}
                    onClick={() => saveGlobal('manual', globalEnabled)}>{t.apiKeys.manual}</button>
                  <button className={`btn-xs ${globalMode === 'auto' ? 'bg-success-soft text-success font-semibold' : 'btn-ghost'}`}
                    onClick={() => saveGlobal('auto', globalEnabled)}>{t.apiKeys.auto}</button>
                </div>
                <button className={`btn-xs font-semibold ${globalEnabled ? 'bg-brand-soft text-brand-main' : 'bg-surface-hover text-ink-muted'}`}
                  onClick={() => saveGlobal(globalMode, !globalEnabled)}>{globalEnabled ? t.apiKeys.on : t.apiKeys.off}</button>
              </div>
            </div>
          </div>
        </div>

        {/* Your API Keys */}
        <div className="card">
          <div className="card-hd flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-primary">{t.apiKeys.yourKeys}</h3>
            <button className="btn-brand btn-xs" onClick={() => { setShowGenerate(!showGenerate); setGenerated(null); }}>
              {t.apiKeys.generateNew}
            </button>
          </div>
          <div className="card-bd p-4">
            <p className="text-xs text-ink-muted mb-3">{t.apiKeys.keyDesc}</p>

            {showGenerate && (
              <div className="mb-4 p-4 border-2 border-brand-main rounded-card bg-brand-soft">
                <p className="text-sm font-semibold text-brand-main mb-3">{t.apiKeys.generateTitle}</p>
                <div className="flex gap-3 mb-3">
                  <div className="flex-1"><label className="form-label">{t.apiKeys.keyName}</label><input className="form-input text-sm" placeholder={t.apiKeys.keyNamePlaceholder} value={newKeyName} onChange={e => setNewKeyName(e.target.value)} /></div>
                  <div className="flex-1"><label className="form-label">{t.apiKeys.permissions}</label><select className="form-select text-sm" value={newKeyScopes} onChange={e => setNewKeyScopes(e.target.value)}>
                    <option value="read">{t.apiKeys.readOnly}</option><option value="read,write">{t.apiKeys.readWrite}</option><option value="read,write,delete">{t.apiKeys.readWriteDelete}</option></select></div>
                  <div className="flex-1"><label className="form-label">{t.apiKeys.hitlMode}</label><select className="form-select text-sm" value={newKeyHitl} onChange={e => setNewKeyHitl(e.target.value)}>
                    <option value="manual">{t.apiKeys.manualConfirm}</option><option value="auto">{t.apiKeys.autoExecute}</option></select></div>
                </div>
                <p className="text-xs text-ink-muted mb-3">{t.apiKeys.keyOnceWarning}</p>
                <div>
                  <div className="flex gap-2">
                    <button className="btn-brand px-5 py-2.5" onClick={handleGenerate}>{t.apiKeys.generateKeyBtn}</button>
                    <button className="btn-secondary px-5 py-2.5" onClick={() => setShowGenerate(false)}>{t.apiKeys.cancel}</button>
                  </div>
                  {!newKeyName.trim() && <p className="text-xs text-danger mt-1.5">{t.apiKeys.enterKeyName}</p>}
                </div>
              </div>
            )}

            {generated && (
              <div className="mb-4 p-3 border border-success/30 rounded-card bg-success-soft">
                <p className="text-sm font-semibold text-success mb-1">{t.apiKeys.keyGenerated}</p>
                <div className="flex items-center gap-2 mb-2">
                  <code className="flex-1 text-sm font-mono bg-surface-card p-2 rounded border border-edge break-all">{generated.key}</code>
                  <button className="btn-brand btn-xs shrink-0" onClick={copyKey}>{copied ? t.apiKeys.copied : t.apiKeys.copy}</button>
                </div>
                <p className="text-xs text-ink-muted">Name: {generated.name} · Scopes: {generated.scopes} · Confirmation: {newKeyHitl} · Expires in 90 days</p>
                <p className="text-xs text-danger mt-1">{t.apiKeys.keyNotShown}</p>
              </div>
            )}

            {loading ? <p className="text-xs text-ink-muted py-4 text-center">{t.apiKeys.loading}</p>
            : keys.length === 0 && !generated ? <p className="text-xs text-ink-muted py-4 text-center">{t.apiKeys.noKeys}</p>
            : keys.map(k => {
              const isEditing = editingId === k.id;
              const hitlMode = k.hitlMode || 'manual';
              const isManual = hitlMode === 'manual';

              if (isEditing) {
                return (
                  <div key={k.id} className="flex items-center gap-3 mb-2 p-2.5 border-2 border-brand-main rounded-card bg-brand-soft">
                    <span className="text-xl">🔑</span>
                    <div className="flex-1">
                      <input className="form-input text-sm font-semibold" style={{ padding: '4px 8px', width: '200px' }} value={editName} onChange={e => setEditName(e.target.value)} />
                    </div>
                    <select className="form-select text-xs" style={{ width: '130px' }} value={editScopes} onChange={e => setEditScopes(e.target.value)}>
                      <option value="read">Read only</option><option value="read,write">Read & Write</option><option value="read,write,delete">Read, Write & Delete</option></select>
                    <button className="btn-brand btn-xs shrink-0" onClick={saveEdit}>{t.apiKeys.save}</button>
                    <button className="btn-secondary btn-xs shrink-0" onClick={() => setEditingId(null)}>{t.apiKeys.cancelEdit}</button>
                  </div>
                );
              }

              return (
                <div key={k.id} className={`flex items-center gap-3 mb-2 p-2.5 border border-edge rounded-card ${!k.isActive ? 'opacity-50' : ''}`}>
                  <span className="text-xl">🔑</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink-primary">{k.name}</div>
                    <div className="text-xs text-ink-muted">
                      <code className="bg-surface-hover px-1.5 py-0.5 rounded text-xs">{k.keyPrefix}****</code>
                      <span className="ml-2">Created {new Date(k.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className="text-xs text-ink-muted shrink-0">{k.scopes}</span>
                  <span className={`badge text-xs shrink-0 ${isManual ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'}`}>
                    {isManual ? t.apiKeys.manualBadge : t.apiKeys.autoBadge}
                  </span>
                  <span className={`badge text-xs shrink-0 ${k.isActive ? 'bg-success-soft text-success' : 'bg-surface-hover text-ink-muted'}`}>
                    {k.isActive ? t.apiKeys.active : t.apiKeys.revoked}
                  </span>
                  {k.isActive && (
                    <div className="flex gap-1 shrink-0">
                      <button className="btn-ghost btn-xs" onClick={() => { setEditingId(k.id); setEditName(k.name); setEditScopes(k.scopes); }}>{t.apiKeys.edit}</button>
                      <button className="btn-ghost btn-xs text-danger" onClick={() => handleRevoke(k.id)}>{t.apiKeys.delete}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* MCP Server Info */}
        <div className="card mt-4">
          <div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">{t.apiKeys.mcpServer}</h3></div>
          <div className="card-bd p-4">
            <p className="text-xs text-ink-muted mb-3">
              {t.apiKeys.mcpDesc}<code className="bg-surface-hover px-1 py-0.5 rounded text-xs">.claude/mcp.json</code> with:
            </p>
            <div className="bg-surface-card rounded p-3 mb-3 font-mono text-xs leading-relaxed overflow-x-auto">
              {'{\n'}
              {'  "mcpServers": {\n'}
              {'    "tomiHub": {\n'}
              {'      "type": "http",\n'}
              {'      "url": "'}<span className="text-brand-main">{window.location.origin}/api/v1/mcp</span>{'",\n'}
              {'      "headers": {\n'}
              {'        "X-Api-Key": "<span className="text-ink-muted">'}{t.apiKeys.pasteKey}{'</span>"\n'}
              {'      }\n'}
              {'    }\n'}
              {'  }\n'}
              {'}'}
            </div>

            <p className="text-xs text-ink-muted mb-2">{t.apiKeys.hitlDesc}</p>

            <p className="text-xs font-semibold text-ink-primary mb-2">{t.apiKeys.availableTools(MCP_TOOLS.length)}</p>
            <div className="space-y-1">
              {MCP_TOOLS.map(tool => (
                <div key={tool.name} className="flex items-center gap-2 text-xs">
                  <code className="text-brand-main bg-brand-soft px-1.5 py-0.5 rounded text-[0.7rem] font-mono">{tool.name}</code>
                  <span className="text-ink-primary">{tool.desc}</span>
                  {tool.confirm && <span className="badge bg-warning-soft text-warning text-[0.55rem]" title={t.apiKeys.hitlDesc}>{t.apiKeys.confirm}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
