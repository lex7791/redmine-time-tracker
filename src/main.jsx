import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { request } from './api.js';
import { formatTime, isoDate, monday, weekDates } from './utils.js';
import '../styles.css';

const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) || key;
const locale = chrome.i18n.getUILanguage().startsWith('ru') ? 'ru-RU' : 'en-US';
const emptyForm = () => ({ date: isoDate(new Date()), key: '', hours: '', activity: '', comment: '', editingId: null });
const icons = {
  copy: 'M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1z',
  delete: 'M 10 2 L 9 3 L 4 3 L 4 5 L 5 5 L 5 20 C 5 20.522222 5.1913289 21.05461 5.5683594 21.431641 C 5.9453899 21.808671 6.4777778 22 7 22 L 17 22 C 17.522222 22 18.05461 21.808671 18.431641 21.431641 C 18.808671 21.05461 19 20.522222 19 20 L 19 5 L 20 5 L 20 3 L 15 3 L 14 2 L 10 2 z M 7 5 L 17 5 L 17 20 L 7 20 L 7 5 z M 9 7 L 9 18 L 11 18 L 11 7 L 9 7 z M 13 7 L 13 18 L 15 18 L 15 7 L 13 7 z',
  edit: 'M 18.414 2 C 17.902 2 17.391 2.195 17 2.586 L 4 15.586 L 4 20 L 8.414 20 L 21.414 7 C 22.195 6.219 22.195 4.953 21.414 4.172 L 19.828 2.586 C 19.438 2.195 18.926 2 18.414 2 z M 18.414 4 L 20 5.586 L 18.586 7 L 17 5.414 L 18.414 4 z M 15.586 6.828 L 17.172 8.414 L 7.586 18 L 6 18 L 6 16.414 L 15.586 6.828 z',
};
function Icon({ name }) { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[name]} /></svg>; }

function App() {
  const [settings, setSettings] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [week, setWeek] = useState(() => monday(new Date()));
  const [form, setForm] = useState(emptyForm);
  const [entries, setEntries] = useState([]);
  const [issues, setIssues] = useState({});
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const data = await chrome.storage.sync.get(['apiKey', 'redmineUrl']);
        if (!active) return;
        setSettings(data.apiKey && data.redmineUrl ? { apiKey: data.apiKey, redmineUrl: data.redmineUrl } : null);
        setSettingsLoaded(true);
      } catch (e) {
        if (active) { setError(e.message); setSettingsLoaded(true); }
      }
    }
    const onChange = (changes, area) => {
      if (area === 'sync' && (changes.apiKey || changes.redmineUrl)) loadSettings();
    };
    chrome.storage.onChanged.addListener(onChange);
    loadSettings();
    return () => { active = false; chrome.storage.onChanged.removeListener(onChange); };
  }, []);

  async function openSettings() {
    try {
      await chrome.windows.create({ url: chrome.runtime.getURL('settings.html'), type: 'popup', width: 540, height: 330 });
    } catch (e) { setError(e.message); }
  }

  const loadWeek = useCallback(async (activeSettings, activeWeek, current) => {
    const dates = weekDates(activeWeek);
    const data = await request(activeSettings, `time_entries.json?user_id=me&from=${isoDate(dates[0])}&to=${isoDate(dates[6])}&limit=100`);
    const nextEntries = data?.time_entries || [];
    const ids = [...new Set(nextEntries.map(entry => entry.issue?.id).filter(Boolean))];
    const issueData = ids.length ? await request(activeSettings, `issues.json?status_id=*&issue_id=${ids.join(',')}`) : null;
    if (generation.current !== current) return;
    setEntries(nextEntries);
    setIssues(Object.fromEntries((issueData?.issues || []).map(issue => [issue.id, issue])));
  }, []);

  useEffect(() => {
    if (!settings) return;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    Promise.all([
      loadWeek(settings, week, current),
      request(settings, 'enumerations/time_entry_activities.json').then(data => {
        if (generation.current === current) setActivities(data?.time_entry_activities || []);
      }),
    ]).catch(e => { if (generation.current === current) setError(e.message); })
      .finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [settings, week, loadWeek]);

  async function mutate(action) {
    if (!settings || loading) return false;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    let completed = false;
    try {
      await action();
      completed = true;
      await loadWeek(settings, week, current);
      return true;
    } catch (e) {
      if (generation.current === current) setError(e.message);
      return completed;
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }

  async function saveTime(event) {
    event.preventDefault();
    const key = form.key.trim();
    if (!form.date || !key || !form.hours.trim() || !form.activity) return;
    const saved = await mutate(async () => {
      const data = await request(settings, `issues/${encodeURIComponent(key)}.json`);
      if (!data?.issue) throw new Error(t('apiError'));
      const entry = { issue_id: data.issue.id, spent_on: form.date, hours: form.hours.trim(), activity_id: form.activity, comments: form.comment.trim() };
      await request(settings, form.editingId ? `time_entries/${form.editingId}.json` : 'time_entries.json', form.editingId ? 'PUT' : 'POST', { time_entry: entry });
    });
    if (saved) setForm(emptyForm());
  }

  function fillForm(entry, edit) {
    const issue = issues[entry.issue?.id];
    setForm({ date: edit ? entry.spent_on : isoDate(new Date()), key: issue?.key || String(entry.issue?.id || ''), hours: String(entry.hours), activity: String(entry.activity?.id || ''), comment: entry.comments || '', editingId: edit ? entry.id : null });
  }
  const setField = (field, value) => setForm(previous => ({ ...previous, [field]: value }));
  const dates = weekDates(week);
  const days = dates.map(date => {
    const dateStr = isoDate(date);
    const dayEntries = entries.filter(entry => entry.spent_on === dateStr);
    return { date, dateStr, entries: dayEntries, total: dayEntries.reduce((sum, entry) => sum + Number(entry.hours), 0) };
  });
  function moveWeek(amount) { setWeek(previous => { const next = new Date(previous); next.setDate(next.getDate() + amount); return next; }); }

  return <div className="container">
    <div className="toolbar">
      <button className="settings-button" type="button" onClick={openSettings}><span aria-hidden="true">⚙</span> {t('settingsTitle')}</button>
      <div className="week-info"><button className="danger" onClick={() => moveWeek(-7)}>← {t('prevWeek')}</button><button className="danger" onClick={() => moveWeek(7)}>{t('nextWeek')} →</button></div>
    </div>
    {settingsLoaded && !settings && !error && <p className="settings-notice">{t('missingSettingsAlert')} <button type="button" className="settings-link" onClick={openSettings}>{t('openSettings')}</button></p>}
    <div className="control">
      <label className="caption" htmlFor="taskNumber">{t('quickEntryCaption')} <Icon name="copy" /></label>
      <form className="fast-creation" onSubmit={saveTime}>
        <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
        <input id="taskNumber" value={form.key} onChange={e => setField('key', e.target.value)} placeholder={t('taskNumberPlaceholder')} />
        <input value={form.hours} onChange={e => setField('hours', e.target.value)} placeholder={t('taskTimePlaceholder')} />
        <select value={form.activity} onChange={e => setField('activity', e.target.value)}><option value="">{t('emptyActivityOption')}</option>{activities.map(activity => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select>
        <input value={form.comment} onChange={e => setField('comment', e.target.value)} placeholder={t('taskCommentPlaceholder')} />
        <button className="secondary" type="submit">{t(form.editingId ? 'editTime' : 'addTime')}</button>
      </form>
    </div>
    <div className="time-grid">
      {error ? <p className="error">{t('errorPrefix')}: {error}</p> : settings && <>
        <div className="grid-header">{days.map(day => <div className="day-header" key={day.dateStr}><div><span className="day-name">{day.date.toLocaleDateString(locale, { weekday: 'short' })}</span>, <span className="day-date">{day.date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span></div><div className={`day-total ${day.total >= 8 ? '_success' : '_warning'}`}>{formatTime(day.total.toFixed(2), t)}</div></div>)}</div>
        <div className="grid-body">{days.map(day => <div className="day-column" key={day.dateStr}>{day.entries.length ? day.entries.map(entry => {
          const issue = issues[entry.issue?.id];
          const key = issue?.key || entry.issue?.id;
          const url = `${settings.redmineUrl.replace(/\/+$/, '')}/issues/${encodeURIComponent(key)}`;
          return <div className="time-entry" key={entry.id}><a className="entry-key link" target="_blank" rel="noreferrer" href={url}>{key}</a><div className="entry-title hint" data-tooltip={issue?.subject}><a className="entry-task link" target="_blank" rel="noreferrer" href={url}>{issue?.subject}</a></div><div className="entry-body"><div className="entry-comment">{entry.comments}</div></div><div className="entry-bottom"><span className="entry-hour _success">{formatTime(entry.hours, t)}</span>{['delete', 'edit', 'copy'].map(action => <button type="button" key={action} className={`entry-btn ${action}-btn hint`} data-tooltip={t(`${action}EntryTooltip`)} aria-label={t(`${action}EntryTooltip`)} onClick={() => action === 'delete' ? mutate(() => request(settings, `time_entries/${entry.id}.json`, 'DELETE')) : fillForm(entry, action === 'edit')}><Icon name={action} /></button>)}</div></div>;
        }) : <div className="no-entries">{t('noEntries')}</div>}</div>)}</div>
      </>}
    </div>
    <div id="loading" style={{ visibility: loading ? 'visible' : 'hidden' }} />
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
