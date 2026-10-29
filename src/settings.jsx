import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './settings.css';

const t = key => chrome.i18n.getMessage(key) || key;

function Settings() {
  const [values, setValues] = useState({ redmineUrl: '', apiKey: '' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['apiKey', 'redmineUrl']).then(data => {
      setValues({ redmineUrl: data.redmineUrl || '', apiKey: data.apiKey || '' });
      setLoaded(true);
    }).catch(e => setError(e.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    const next = { redmineUrl: values.redmineUrl.trim(), apiKey: values.apiKey.trim() };
    if (!next.redmineUrl) return setError(t('missingRedmineUrlAlert'));
    if (!next.apiKey) return setError(t('missingApiKeyAlert'));
    try {
      await chrome.storage.sync.set(next);
      setValues(next);
      setError('');
      setSaved(true);
    } catch (e) { setError(e.message); }
  }

  function change(field, value) {
    setValues(previous => ({ ...previous, [field]: value }));
    setSaved(false);
    setError('');
  }

  return <main>
    <h1>{t('settingsWindowTitle')}</h1>
    <form onSubmit={save}>
      <label>{t('urlLabel')}<input type="url" value={values.redmineUrl} onChange={e => change('redmineUrl', e.target.value)} placeholder={t('redmineUrlPlaceholder')} /></label>
      <label>{t('apiKeyLabel')}<input type="password" value={values.apiKey} onChange={e => change('apiKey', e.target.value)} placeholder={t('apiKeyPlaceholder')} /></label>
      <button type="submit" disabled={!loaded}>{t('saveSettings')}</button>
      {error && <p role="alert" className="error">{error}</p>}
      {saved && <p role="status">{t('settingsSavedAlert')}</p>}
    </form>
  </main>;
}

createRoot(document.getElementById('root')).render(<Settings />);
