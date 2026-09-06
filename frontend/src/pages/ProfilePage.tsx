import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { masterDataApi } from '@/api/masterDataApi';
import { authApi } from '@/api/authApi';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/useT';

export function ProfilePage() {
  const t = useT();
  const { user, setAuth, canWrite } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [skills, setSkills] = useState<string[]>(() => (user?.skills || '').split(',').filter(Boolean));
  const [skillList, setSkillList] = useState<Array<{key:string;value:string;color:string}>>([]);
  const [customSkill, setCustomSkill] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifInterval, setNotifInterval] = useState(
    localStorage.getItem('notifRefreshInterval') || '30'
  );

  useEffect(() => {
    masterDataApi.list('skill_tags').then((res) => {
      setSkillList((res.data.data as Array<{key:string;value:string;color:string}>) || []);
    }).catch(()=>{});
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      const { data: resp } = await authApi.updateProfile({
        displayName: displayName || undefined,
        gender: gender || undefined,
        skills: skills.length > 0 ? skills.join(',') : undefined,
      });
      // Update store with new user data
      if (resp.data) {
        const currentToken = localStorage.getItem('ai-pm-auth') ? JSON.parse(localStorage.getItem('ai-pm-auth') || '{}') : {};
        setAuth(resp.data, { accessToken: currentToken?.state?.accessToken || '', refreshToken: currentToken?.state?.refreshToken || '' } as never);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* error */ }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="ch">
        <h2 className="text-base font-semibold text-ink-primary">{t.profile.title}</h2>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-status-success">{t.profile.saved}</span>}
          {canWrite() && <button className="btn-brand" onClick={handleSave} disabled={saving}>{saving ? t.profile.saving : t.profile.saveChanges}</button>}
        </div>
      </div>
      <div className="p-6" style={{ maxWidth: '800px' }}>
        {/* ── Profile Info ── */}
        <div className="card mb-4">
          <div className="card-bd p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="av w-14 h-14 text-[22px]">{user?.displayName?.charAt(0) || '?'}</div>
              <div>
                <div className="text-base font-semibold text-ink-primary">{user?.displayName || '...'}</div>
                <div className="text-xs text-ink-muted">{user?.email || '...'}</div>
              </div>
            </div>

            <div className="form-grp">
              <label className="form-label">{t.profile.displayName}</label>
              <input className="form-input w-full" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>

            <div className="form-grp">
              <label className="form-label">{t.profile.email}</label>
              <input className="form-input w-full" value={user?.email || ''} disabled style={{ opacity: 0.6 }} />
              <span className="text-xs text-ink-muted">{t.profile.emailVerified}</span>
            </div>

            {/* Gender */}
            <div className="form-grp">
              <label className="form-label">{t.profile.gender}</label>
              <div className="flex gap-2">
                {['Male', 'Female', 'PreferNot'].map(g => (
                  <button key={g} type="button"
                    className={cn(gender === g && 'selected')}
                    style={{
                      padding:'8px 16px',borderRadius:'0.5rem',cursor:'pointer',fontSize:12,
                      border: gender===g?'1px solid hsl(var(--brand))':'1px solid hsl(var(--e-d))',
                      background: gender===g?'hsl(var(--brand-s))':'transparent',
                      color: gender===g?'hsl(var(--brand))':'hsl(var(--i-s))',
                      fontFamily:'var(--f)',transition:'all 0.12s',
                    }}
                    onClick={() => setGender(g)}>
                    {g === 'Male' ? t.profile.male : g === 'Female' ? t.profile.female : t.profile.other}
                  </button>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div className="form-grp">
              <label className="form-label">{t.profile.skills}</label>
              <p className="text-xs text-ink-muted mb-2">{t.profile.skillsDesc}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {skills.map(sk => {
                  const info = skillList.find(s => s.key === sk);
                  return (
                    <button key={sk} type="button"
                      className="text-xs rounded px-2 py-0.5 border bg-brand-main text-brand-text border-brand-main"
                      onClick={() => setSkills(prev => prev.filter(s => s !== sk))}>
                      {info ? info.value : sk} <span className="ml-0.5 opacity-60">×</span>
                    </button>
                  );
                })}
                {skillList.filter(s => !skills.includes(s.key)).map(sk => (
                  <button key={sk.key} type="button"
                    className="text-xs rounded px-2 py-0.5 border bg-surface-card text-ink-secondary border-edge hover:border-edge-hover transition-colors"
                    onClick={() => setSkills(prev => [...prev, sk.key])}>
                    {sk.value}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="form-input flex-1" style={{padding:'4px 8px',fontSize:12}} placeholder={t.profile.otherSkills}
                  value={customSkill} onChange={e => setCustomSkill(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && customSkill.trim()) { e.preventDefault(); setSkills(prev => prev.includes(customSkill.trim())?prev:[...prev,customSkill.trim()]); setCustomSkill(''); }}} />
                <button type="button" className="btn btn-s btn-xs" onClick={() => { if(customSkill.trim()){ setSkills(prev => prev.includes(customSkill.trim())?prev:[...prev,customSkill.trim()]); setCustomSkill(''); }}}>{t.profile.add}</button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Notification Settings ── */}
        <div className="card mb-4">
          <div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">{t.profile.notifSettings}</h3></div>
          <div className="card-bd p-4">
            <div className="form-grp">
              <label className="form-label">{t.profile.refreshInterval}</label>
              <p className="text-xs text-ink-muted mb-2">{t.profile.refreshIntervalDesc}</p>
              <select className="form-select" style={{ width: '200px' }}
                value={notifInterval}
                onChange={e => { setNotifInterval(e.target.value); localStorage.setItem('notifRefreshInterval', e.target.value); }}>
                <option value="10">{t.profile.every10s}</option>
                <option value="30">{t.profile.every30s}</option>
                <option value="60">{t.profile.every1m}</option>
                <option value="120">{t.profile.every2m}</option>
                <option value="300">{t.profile.every5m}</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Linked Accounts ── */}
        <div className="card">
          <div className="card-hd"><h3 className="text-sm font-semibold text-ink-primary">{t.profile.linkedAccounts}</h3></div>
          <div className="card-bd p-4">
            <p className="text-xs text-ink-muted mb-3">{t.profile.linkedAccountsDesc}</p>
            <div className="flex items-center gap-4 mb-3 p-2.5 border border-edge rounded-card">
              <span className="text-2xl">🟦</span>
              <div className="flex-1"><div className="text-sm font-semibold text-ink-primary">{t.profile.feishu}</div><div className="text-xs text-ink-muted">{t.profile.notBound}</div></div>
              <button className="btn-secondary btn-xs">{t.profile.bind}</button>
            </div>
            <div className="flex items-center gap-4 p-2.5 border border-edge rounded-card">
              <span className="text-2xl">🟢</span>
              <div className="flex-1"><div className="text-sm font-semibold text-ink-primary">{t.profile.wecom}</div><div className="text-xs text-ink-muted">{t.profile.notBound}</div></div>
              <button className="btn-secondary btn-xs">{t.profile.bind}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
