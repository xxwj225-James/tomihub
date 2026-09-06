import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { projectApi } from '@/api/projectApi';
import { useProjectStore } from '@/stores/projectStore';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useT } from '@/i18n/useT';

export function CreateProjectPage() {
  const t = useT();
  const navigate = useNavigate();
  const { addProject } = useProjectStore();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [generateWiki, setGenerateWiki] = useState(true);
  const [methodology, setMethodology] = useState('scrum');

  const handleNameChange = (value: string) => {
    setName(value);
    if (!key || key === nameToKey(name)) {
      setKey(nameToKey(value));
    }
  };

  const nameToKey = (s: string) => s.replace(/[^A-Za-z]/g, '').substring(0, 5).toUpperCase();

  const handleCreate = async () => {
    setError(''); setLoading(true);
    try {
      const { data: resp } = await projectApi.create({ name, key, description, generateWiki, methodology });
      if (resp.data) addProject(resp.data);
      navigate({ to: '/project-overview' });
    } catch (err) {
      setError(getErrorMessage(err, { errors: { default: t.createProject.failed } }));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-app">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h1 className="text-xl font-bold text-ink-primary">{t.createProject.title}</h1>
          <p className="text-sm text-ink-muted mt-1">{t.createProject.subtitle}</p>
        </CardHeader>
        <CardContent>
          {error && <div className="card bg-danger-soft text-danger p-3 mb-4 text-sm">{error}</div>}
          <div className="space-y-4">
            <Input label={t.createProject.projectName} placeholder={t.createProject.projectNamePlaceholder}
              value={name} onChange={e => handleNameChange(e.target.value)} />
            <Input label={t.createProject.projectKey} placeholder={t.createProject.projectKeyPlaceholder}
              value={key} onChange={e => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10))} />
            <div className="form-grp">
              <label className="form-label">Methodology</label>
              <select className="form-select" value={methodology} onChange={e => setMethodology(e.target.value)}>
                <option value="scrum">Scrum</option>
                <option value="kanban">Kanban</option>
                <option value="waterfall">Waterfall</option>
              </select>
            </div>
            <div className="form-grp">
              <label className="form-label">{t.createProject.description}</label>
              <textarea className="input" style={{ minHeight: '80px' }}
                placeholder={t.createProject.descriptionPlaceholder}
                value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <label className="flex items-start gap-3 p-3 rounded-card bg-surface-hover cursor-pointer">
              <input type="checkbox" checked={generateWiki} onChange={e => setGenerateWiki(e.target.checked)}
                className="mt-0.5" />
              <div>
                <span className="text-sm font-medium text-ink-primary">{t.createProject.generateWiki}</span>
                <p className="text-xs text-ink-muted mt-0.5">{t.createProject.generateWikiDesc}</p>
              </div>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => navigate({ to: '/home' })}>{t.createProject.cancel}</Button>
              <Button onClick={handleCreate} loading={loading} disabled={!name || !key}>
                {t.createProject.create}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
