import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { assignedIssues, statusDefaults } from './dashboard-api.js';
import './settings.css';

const estimateMessages = chrome.i18n.getUILanguage().startsWith('ru') ? {
  estimateSettingsTab: 'Оценка',
  estimateFieldsHint: 'Загрузите поля из назначенных вам задач и выберите поле для оценки в списке задач.',
  loadEstimateFields: 'Загрузить поля',
  estimateFieldLabel: 'Поле оценки',
  standardEstimate: 'Общая оценка',
  customFieldId: 'Дополнительное поле #',
} : {
  estimateSettingsTab: 'Estimate',
  estimateFieldsHint: 'Load fields from your assigned issues and choose the estimate field for the task list.',
  loadEstimateFields: 'Load fields',
  estimateFieldLabel: 'Estimate field',
  standardEstimate: 'Standard estimate',
  customFieldId: 'Custom field #',
};
const t = key => chrome.i18n.getMessage(key) || estimateMessages[key] || key;

function Settings() {
  const [tab, setTab] = useState('connection');
  const [values, setValues] = useState({ redmineUrl: '', apiKey: '' });
  const [statuses, setStatuses] = useState(statusDefaults);
  const [statusesChanged, setStatusesChanged] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [estimateField, setEstimateField] = useState('');
  const [fields, setFields] = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['apiKey', 'redmineUrl', 'estimateField', ...Object.keys(statusDefaults)]).then(data => {
      setValues({ redmineUrl: data.redmineUrl || '', apiKey: data.apiKey || '' });
      setStatuses(Object.fromEntries(Object.keys(statusDefaults).map(key => [key, data[key] || statusDefaults[key]])));
      setEstimateField(data.estimateField || '');
      setLoaded(true);
    }).catch(e => setError(e.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    const next = { redmineUrl: values.redmineUrl.trim(), apiKey: values.apiKey.trim() };
    if (!next.redmineUrl) { setTab('connection'); return setError(t('missingRedmineUrlAlert')); }
    if (!event.currentTarget.elements.redmineUrl.validity.valid) { setTab('connection'); return setError(t('invalidRedmineUrl')); }
    if (!next.apiKey) { setTab('connection'); return setError(t('missingApiKeyAlert')); }
    try {
      await chrome.storage.sync.set({ ...next, ...(statusesChanged ? statuses : {}), estimateField });
      setStatusesChanged(false);
      setValues(next);
      setError('');
      setSaved(true);
    } catch (e) { setError(e.message); }
  }

  async function loadFields() {
    setFieldsLoading(true); setError('');
    try {
      const issues = await assignedIssues({ redmineUrl: values.redmineUrl.trim(), apiKey: values.apiKey.trim() });
      const found = new Map();
      issues.forEach(issue => (issue.custom_fields || []).forEach(field => found.set(String(field.id), field.name)));
      setFields([...found].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { setError(e.message); }
    finally { setFieldsLoading(false); }
  }

  function change(field, value) {
    setValues(previous => ({ ...previous, [field]: value }));
    setSaved(false);
    setError('');
  }

  return <main>
    <h1>{t('settingsWindowTitle')}</h1>
    <div className="settings-tabs" aria-label={t('settingsTitle')}>
      <button type="button" className={tab === 'connection' ? 'active' : ''} aria-pressed={tab === 'connection'} onClick={() => setTab('connection')}>{t('connectionTab')}</button>
      <button type="button" className={tab === 'statuses' ? 'active' : ''} aria-pressed={tab === 'statuses'} onClick={() => setTab('statuses')}>{t('statusTab')}</button>
      <button type="button" className={tab === 'estimate' ? 'active' : ''} aria-pressed={tab === 'estimate'} onClick={() => setTab('estimate')}>{t('estimateSettingsTab')}</button>
    </div>
    <form onSubmit={save} noValidate>
      <div className="settings-panel" hidden={tab !== 'connection'}>
        <label>{t('urlLabel')}<input name="redmineUrl" type="url" value={values.redmineUrl} onChange={e => change('redmineUrl', e.target.value)} placeholder={t('redmineUrlPlaceholder')} /></label>
        <label>{t('apiKeyLabel')}<input type="password" value={values.apiKey} onChange={e => change('apiKey', e.target.value)} placeholder={t('apiKeyPlaceholder')} /></label>
      </div>
      <div className="settings-panel status-settings" hidden={tab !== 'statuses'}>
        <p>{t('statusSettingsHint')}</p>
        {Object.keys(statusDefaults).map(field => <label key={field}>{t(field)}<input value={statuses[field]} onChange={e => { setStatuses(previous => ({ ...previous, [field]: e.target.value })); setStatusesChanged(true); setSaved(false); setError(''); }} /></label>)}
      </div>
      <div className="settings-panel" hidden={tab !== 'estimate'}>
        <p>{t('estimateFieldsHint')}</p>
        <button type="button" className="load-fields" onClick={loadFields} disabled={fieldsLoading}>{t('loadEstimateFields')}</button>
        <label>{t('estimateFieldLabel')}<select value={estimateField} onChange={e => { setEstimateField(e.target.value); setSaved(false); }}>
          <option value="">{t('standardEstimate')}</option>
          {estimateField && !fields.some(field => field.id === estimateField) && <option value={estimateField}>{t('customFieldId')} {estimateField}</option>}
          {fields.map(field => <option key={field.id} value={field.id}>{field.name} (#{field.id})</option>)}
        </select></label>
      </div>
      <button className="save-button" type="submit" disabled={!loaded}>{t('saveSettings')}</button>
      {error && <p role="alert" className="error">{error}</p>}
      {saved && <p role="status">{t('settingsSavedAlert')}</p>}
    </form>
  </main>;
}

createRoot(document.getElementById('root')).render(<Settings />);
