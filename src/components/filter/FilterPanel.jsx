import { useCallback, useEffect, useState } from 'react';
import { clearClassifications, getAllClassifications } from '../../db/database.js';
import { classifyVideo, getOllamaStatus, MODEL, OLLAMA_URL } from '../../llm/ollamaClient.js';

const IS_EXTENSION = location.protocol === 'chrome-extension:';

export default function FilterPanel() {
  const [status, setStatus] = useState(null); // null = checking
  const [cache, setCache] = useState([]);
  const [test, setTest] = useState({ title: '', channel: '' });
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const checkStatus = useCallback(() => {
    setStatus(null);
    getOllamaStatus().then(setStatus);
  }, []);

  const refreshCache = useCallback(() => {
    getAllClassifications()
      .then((entries) =>
        setCache(entries.sort((a, b) => (a.classifiedAt < b.classifiedAt ? 1 : -1)))
      )
      .catch(() => setCache([]));
  }, []);

  useEffect(() => {
    checkStatus();
    refreshCache();
  }, [checkStatus, refreshCache]);

  const handleTest = async (event) => {
    event.preventDefault();
    if (!test.title.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await classifyVideo({
        title: test.title.trim(),
        channel: test.channel.trim(),
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ error: String(err?.message ?? err) });
    } finally {
      setTesting(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('Clear all cached verdicts? Videos will be re-classified next time they appear.')) return;
    await clearClassifications();
    refreshCache();
  };

  const modelReady = status?.online && status.models.some((m) => m.startsWith(MODEL));
  const counts = countByVerdict(cache);

  return (
    <section>
      <header className="view-header">
        <div>
          <h1>Filter Engine</h1>
          <p className="subtitle">
            Local LLM classification via Ollama — nothing leaves this device.
          </p>
        </div>
      </header>

      <div className="settings-block">
        <h3>Ollama status</h3>
        {status === null ? (
          <p className="hint">Checking {OLLAMA_URL}…</p>
        ) : status.online ? (
          <p className="filter-status">
            <span className="status-dot online" />
            Connected · {modelReady ? `model ${MODEL} ready` : `model ${MODEL} NOT found — run: ollama pull ${MODEL}`}
          </p>
        ) : (
          <div>
            <p className="filter-status">
              <span className="status-dot offline" />
              Not reachable at {OLLAMA_URL} ({status.error})
            </p>
            <p className="hint">
              Make sure the Ollama app is running.
              {!IS_EXTENSION &&
                ' You are on the dev server — Ollama only allows the installed extension origin, so this check is expected to fail here.'}
            </p>
          </div>
        )}
        <div className="view-actions">
          <button className="btn btn-ghost" onClick={checkStatus}>Re-check</button>
        </div>
      </div>

      <div className="settings-block">
        <h3>Test a classification</h3>
        <p className="hint">
          Runs the same prompt the live filter uses. First request after Ollama
          starts loads the model (~6s); after that ~1s per video.
        </p>
        <form className="filter-test-form" onSubmit={handleTest}>
          <input
            placeholder="Video title"
            value={test.title}
            onChange={(e) => setTest({ ...test, title: e.target.value })}
          />
          <input
            placeholder="Channel (optional)"
            value={test.channel}
            onChange={(e) => setTest({ ...test, channel: e.target.value })}
          />
          <button className="btn btn-primary" disabled={testing || !test.title.trim()}>
            {testing ? 'Classifying…' : 'Classify'}
          </button>
        </form>
        {testResult?.error && <p className="error-banner">{testResult.error}</p>}
        {testResult && !testResult.error && (
          <p className="filter-status">
            <span className={`verdict-badge verdict-${testResult.verdict}`}>
              {testResult.verdict}
            </span>
            {Math.round(testResult.confidence * 100)}% · {testResult.reason || 'no reason given'} ·{' '}
            {testResult.tookMs}ms
          </p>
        )}
      </div>

      <div className="settings-block">
        <h3>Verdict cache</h3>
        <p className="hint">
          Videos classified while browsing YouTube. Each video is only judged
          once; verdicts are reused from this cache.
        </p>
        <p className="filter-status">
          {cache.length} cached ·{' '}
          <span className="verdict-badge verdict-quality">{counts.quality} quality</span>{' '}
          <span className="verdict-badge verdict-neutral">{counts.neutral} neutral</span>{' '}
          <span className="verdict-badge verdict-slop">{counts.slop} slop</span>
        </p>
        {cache.length > 0 && (
          <>
            <table className="cache-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Channel</th>
                  <th>Verdict</th>
                  <th>Conf.</th>
                </tr>
              </thead>
              <tbody>
                {cache.slice(0, 15).map((entry) => (
                  <tr key={entry.videoId}>
                    <td title={entry.reason}>{entry.title}</td>
                    <td>{entry.channel}</td>
                    <td>
                      <span className={`verdict-badge verdict-${entry.verdict}`}>
                        {entry.verdict}
                      </span>
                    </td>
                    <td>{Math.round(entry.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="view-actions">
              <button className="btn btn-ghost" onClick={refreshCache}>Refresh</button>
              <button className="btn btn-danger-ghost" onClick={handleClearCache}>
                Clear cache
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function countByVerdict(entries) {
  const counts = { quality: 0, neutral: 0, slop: 0 };
  entries.forEach((e) => {
    if (counts[e.verdict] !== undefined) counts[e.verdict] += 1;
  });
  return counts;
}
