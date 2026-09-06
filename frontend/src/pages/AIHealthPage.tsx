import { useState, useEffect, useCallback } from 'react';
import { useT } from '@/i18n/useT';
import { aiApi, type HealthResult } from '@/api/aiApi';
import { getErrorMessage } from '@/lib/errors';
import { HealthGauge } from '@/components/ai/HealthGauge';

interface Props {
  projectId: string;
}

export function AIHealthPage({ projectId }: Props) {
  const t = useT();
  const [data, setData] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pollTask = useCallback(async (taskId: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const { data: resp } = await aiApi.getAnalysisTask(taskId);
      if (resp.data.status === 'completed' && resp.data.result) {
        setData(resp.data.result);
        return;
      }
      if (resp.data.status === 'failed') throw new Error('Analysis failed');
    }
    throw new Error('Analysis timed out');
  }, []);

  const fetchHealth = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const cached = await aiApi.getHealthCache(projectId);
      if (cached.data.data) {
        setData(cached.data.data);
      } else {
        // No cache — trigger analysis
        const { data: resp } = await aiApi.analyzeHealth(projectId);
        await pollTask(resp.data.task_id);
      }
    } catch (err) {
      setError(getErrorMessage(err, t.ai || { errors: { default: 'Failed to load' } }));
    } finally { setLoading(false); }
  }, [projectId, t, pollTask]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const runAnalysis = async () => {
    try {
      setLoading(true);
      const { data: resp } = await aiApi.analyzeHealth(projectId);
      await pollTask(resp.data.task_id);
    } catch (err) {
      setError(getErrorMessage(err, t.ai || { errors: { default: 'Analysis failed' } }));
    } finally { setLoading(false); }
  };

  if (loading && !data) {
    return <div className="p-6"><div className="animate-pulse card p-8 text-center text-ink-muted">{t.ai.healthAnalyzing}</div></div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-ink-primary">{t.ai.healthTitle}</h2>
          <p className="text-sm text-ink-muted mt-0.5">{t.ai.healthDesc}</p>
        </div>
        <button className="btn-secondary" onClick={runAnalysis} disabled={loading}>
          {loading ? t.ai.healthAnalyzingBtn : t.ai.healthRunAnalysis}
        </button>
      </div>

      {error && <div className="card bg-danger-soft text-danger p-3 mb-4 text-sm">{error}</div>}

      {data && (
        <>
          <div className="card mb-4 p-6 ai-glow">
            <HealthGauge score={data.health_score} size="lg" />
            <p className="text-sm text-ink-secondary mt-3">{data.summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {Object.entries(data.dimensions).map(([key, value]) => (
              <div key={key} className="card p-4">
                <div className="flex justify-between mb-2 text-sm">
                  <span className="text-ink-secondary capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="font-semibold text-ink-primary">{value}%</span>
                </div>
                <div className="progress"><div className="progress-bar brand" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>

          {data.risks.length > 0 && (
            <div className="card mb-4">
              <div className="card-hd"><h3>Risk Alerts</h3></div>
              <div className="card-bd-nopad">
                {data.risks.map((r, i) => (
                  <div key={i} className="hover-row p-3 border-b border-edge last:border-b-0">
                    <p className="text-sm text-ink-primary">
                      {typeof r === 'string' ? r : r.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-hd"><h3>Recommendations</h3></div>
            <div className="card-bd">
              <ul className="space-y-2">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-ink-secondary flex items-start gap-2">
                    <span className="text-brand-main mt-0.5">💡</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
