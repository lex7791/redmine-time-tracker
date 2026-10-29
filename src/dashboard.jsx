import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { assignedIssues, createIssueLoader, getHierarchy, issueGroup, statusDefaults } from './dashboard-api.js';
import './dashboard.css';

const ru = chrome.i18n.getUILanguage().startsWith('ru');
const copy = ru ? {
  title: 'Мои задачи', refresh: 'Обновить', settings: 'Настройки', working: 'В работе', testing: 'Мои задачи в тесте', next: 'Следующие', backlog: 'Бэклог', project: 'Проект', allProjects: 'Все проекты', estimateFilter: 'Без оценки', priority: 'Приоритет', allPriorities: 'Все приоритеты', type: 'Тип задачи', allTypes: 'Все типы', parent: 'Родительская задача', issue: 'Задача', estimate: 'Оценка', spent: 'Учтено', days: 'В работе', updated: 'Обновление', needsEstimate: 'Нужна оценка', empty: 'Нет задач с выбранными фильтрами', loading: 'Загрузка задач…', loadError: 'Не удалось загрузить задачи', missing: 'Укажите адрес Redmine и API-ключ в настройках.', description: 'Описание', comments: 'Комментарии', author: 'Автор', assignee: 'Ответственный', status: 'Статус', details: 'Загрузка подробностей…', detailsError: 'Не удалось загрузить подробности задачи', open: 'Открыть в Redmine', close: 'Закрыть', timeReadOnly: 'Запись времени доступна в основном окне расширения.', expand: 'Показать полностью', collapse: 'Свернуть', daysShort: 'дн.', configuredStatuses: 'Настройка статусов', workingStatuses: 'Статусы «В работе»', testingStatuses: 'Статусы «Мои задачи в тесте»', nextStatuses: 'Статусы «Следующие»', backlogStatuses: 'Статусы «Бэклог»', statusHint: 'Укажите названия статусов через запятую.', save: 'Сохранить', cancel: 'Отмена', saved: 'Настройки сохранены', loadedStatuses: 'Статусы в ответе Redmine', clearFilters: 'Очистить фильтры',
} : {
  title: 'My tasks', refresh: 'Refresh', settings: 'Settings', working: 'In progress', testing: 'My tasks in testing', next: 'Next', backlog: 'Backlog', project: 'Project', allProjects: 'All projects', estimateFilter: 'Without estimate', priority: 'Priority', allPriorities: 'All priorities', type: 'Issue type', allTypes: 'All types', parent: 'Parent task', issue: 'Issue', estimate: 'Estimate', spent: 'Logged', days: 'In progress', updated: 'Updated', needsEstimate: 'Needs estimate', empty: 'No tasks match the selected filters', loading: 'Loading tasks…', loadError: 'Could not load tasks', missing: 'Enter the Redmine URL and API key in Settings.', description: 'Description', comments: 'Comments', author: 'Author', assignee: 'Assignee', status: 'Status', details: 'Loading task details…', detailsError: 'Could not load task details', open: 'Open in Redmine', close: 'Close', timeReadOnly: 'Time can be recorded in the main extension popup.', expand: 'Show more', collapse: 'Show less', daysShort: 'days', configuredStatuses: 'Status settings', workingStatuses: 'In progress statuses', testingStatuses: 'My tasks in testing statuses', nextStatuses: 'Next statuses', backlogStatuses: 'Backlog statuses', statusHint: 'Enter status names separated by commas.', save: 'Save', cancel: 'Cancel', saved: 'Settings saved', loadedStatuses: 'Statuses returned by Redmine', clearFilters: 'Clear filters',
};
const locale = ru ? 'ru-RU' : 'en-US';
const dateText = value => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const hoursText = value => `${Number(value || 0).toFixed(Number(value || 0) % 1 ? 1 : 0)} ${ru ? 'ч' : 'h'}`;
const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const statusFields = Object.keys(statusDefaults);

function App() {
  const [settings, setSettings] = useState(null);
  const [issues, setIssues] = useState([]);
  const [hierarchies, setHierarchies] = useState({});
  const [detailCache, setDetailCache] = useState({});
  const [view, setView] = useState('working');
  const [project, setProject] = useState('');
  const [priority, setPriority] = useState('');
  const [tracker, setTracker] = useState('');
  const [estimate, setEstimate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showStatuses, setShowStatuses] = useState(false);
  const [statusDraft, setStatusDraft] = useState(statusDefaults);
  const [statusError, setStatusError] = useState('');
  const loadGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const loader = useRef(null);
  const configured = Boolean(settings?.apiKey && settings?.redmineUrl);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError('');
    try {
      const stored = await chrome.storage.sync.get(['apiKey', 'redmineUrl', ...statusFields]);
      if (generation !== loadGeneration.current) return;
      const nextSettings = { ...statusDefaults, ...stored };
      setSettings(nextSettings);
      setStatusDraft(Object.fromEntries(statusFields.map(key => [key, nextSettings[key] || statusDefaults[key]])));
      if (!nextSettings.apiKey || !nextSettings.redmineUrl) { setIssues([]); setHierarchies({}); return; }
      const nextLoader = createIssueLoader(nextSettings);
      const data = await assignedIssues(nextSettings);
      if (generation !== loadGeneration.current) return;
      loader.current = nextLoader;
      setIssues(data);
      setHierarchies({});
      setDetailCache({});
      setSelected(null);
      setProject(''); setPriority(''); setTracker('');
      for (const issue of data) {
        if (!issue.parent?.id) continue;
        getHierarchy(issue, nextLoader).then(hierarchy => {
          if (generation === loadGeneration.current) setHierarchies(previous => ({ ...previous, [issue.id]: hierarchy }));
        });
      }
    } catch (e) {
      if (generation === loadGeneration.current) setError(e.message);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); return () => { loadGeneration.current++; detailGeneration.current++; }; }, [load]);

  async function openIssue(issue) {
    const generation = ++detailGeneration.current;
    setSelected(issue); setExpanded(false); setDetailError('');
    if (detailCache[issue.id]) { setDetails(detailCache[issue.id]); setDetailLoading(false); return; }
    setDetails(null); setDetailLoading(true);
    try {
      const result = await loader.current(issue.id, true);
      if (generation !== detailGeneration.current) return;
      if (!result?.issue) throw new Error(copy.detailsError);
      setDetails(result.issue);
      setDetailCache(previous => ({ ...previous, [issue.id]: result.issue }));
    } catch (e) { if (generation === detailGeneration.current) setDetailError(e.message); }
    finally { if (generation === detailGeneration.current) setDetailLoading(false); }
  }
  function closeIssue() { detailGeneration.current++; setSelected(null); setDetails(null); }
  async function saveStatuses(event) {
    event.preventDefault();
    try { await chrome.storage.sync.set(statusDraft); setShowStatuses(false); setStatusError(''); await load(); }
    catch (e) { setStatusError(e.message); }
  }
  async function openSettings() {
    try { await chrome.windows.create({ url: chrome.runtime.getURL('settings.html'), type: 'popup', width: 540, height: 330 }); }
    catch (e) { setError(e.message); }
  }
  const base = settings?.redmineUrl?.replace(/\/+$/, '') || '';
  const issueUrl = id => `${base}/issues/${encodeURIComponent(id)}`;
  const filtered = issues.filter(issue => (!project || issue.project?.name === project) && (!priority || issue.priority?.name === priority) && (!tracker || issue.tracker?.name === tracker) && (!estimate || !issue.estimated_hours));
  const grouped = group => filtered.filter(issue => issueGroup(issue.status?.name, settings || statusDefaults) === group);
  const visible = grouped(view).sort((a, b) => {
    const weight = issue => /high|высок/i.test(issue.priority?.name || '') ? 0 : /low|низк/i.test(issue.priority?.name || '') ? 2 : 1;
    return weight(a) - weight(b);
  });
  const daysInWork = issue => {
    const journals = detailCache[issue.id]?.journals || [];
    const changed = [...journals].reverse().find(j => j.details?.some(d => d.name === 'status_id' && String(d.new_value) === String(issue.status?.id)));
    const date = changed?.created_on || (detailCache[issue.id] ? issue.created_on : null);
    return date && !Number.isNaN(Date.parse(date)) ? Math.max(1, Math.ceil((Date.now() - Date.parse(date)) / 86400000)) : null;
  };
  const section = (label, values, value, setValue, all) => <label>{label}<select value={value} onChange={e => setValue(e.target.value)}><option value="">{all}</option>{values.map(item => <option key={item} value={item}>{item}</option>)}</select></label>;

  return <main className="dashboard">
    <header className="dashboard-header"><h1>{copy.title}</h1><div><button className="secondary" onClick={() => setShowStatuses(true)}>{copy.configuredStatuses}</button> <button className="secondary" onClick={openSettings}>⚙ {copy.settings}</button> <button onClick={load} disabled={loading}>{copy.refresh}</button></div></header>
    <p className={error ? 'error' : 'dashboard-message'} role={error ? 'alert' : undefined}>{error ? `${copy.loadError}: ${error}` : loading ? copy.loading : !configured ? copy.missing : ''}</p>
    <nav className="dashboard-tabs">{['working', 'testing', 'next', 'backlog'].map(group => <button key={group} className={view === group ? 'active' : ''} aria-pressed={view === group} onClick={() => setView(group)}>{copy[group]} ({grouped(group).length})</button>)}</nav>
    <div className="dashboard-filters">
      {section(copy.project, unique(issues.map(i => i.project?.name)), project, setProject, copy.allProjects)}
      {section(copy.type, unique(issues.map(i => i.tracker?.name)), tracker, setTracker, copy.allTypes)}
      {section(copy.priority, unique(issues.map(i => i.priority?.name)), priority, setPriority, copy.allPriorities)}
      <label className="check"><input type="checkbox" checked={estimate} onChange={e => setEstimate(e.target.checked)} />{copy.estimateFilter}</label>
      <button className="secondary clear-filters" type="button" onClick={() => { setProject(''); setTracker(''); setPriority(''); setEstimate(false); }}>{copy.clearFilters}</button>
    </div>
    <div className="dashboard-table-wrap"><table><thead><tr>{[copy.project, copy.type, copy.parent, copy.issue, copy.priority, copy.status, copy.estimate, copy.spent, ...(view === 'working' ? [copy.days] : []), copy.updated].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(issue => <tr key={issue.id} tabIndex="0" onClick={() => openIssue(issue)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openIssue(issue); } }}>
      <td>{issue.project?.name || '—'}</td><td className="issue-type">{issue.tracker?.name || '—'}</td><td>{issue.parent?.id ? <a href={issueUrl(issue.parent.id)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{hierarchies[issue.id]?.parent?.subject || `#${issue.parent.id}`}</a> : '—'}</td>
      <td><a href={issueUrl(issue.id)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{issue.key || `#${issue.id}`}</a> {issue.subject}</td><td>{issue.priority?.name || '—'}</td><td>{issue.status?.name || '—'}</td><td>{issue.estimated_hours ? hoursText(issue.estimated_hours) : copy.needsEstimate}</td><td>{hoursText(issue.spent_hours)}</td>{view === 'working' && <td>{daysInWork(issue) ? `${daysInWork(issue)} ${copy.daysShort}` : '—'}</td>}<td>{dateText(issue.updated_on)}</td>
    </tr>)}</tbody></table>{!visible.length && <p className="empty">{configured ? copy.empty : copy.missing}</p>}{configured && !visible.length && issues.length > 0 && <p className="empty">{copy.loadedStatuses}: {unique(issues.map(i => i.status?.name)).join(', ')}</p>}</div>
    {selected && <div className="overlay" onClick={closeIssue}><aside className="issue-panel" role="dialog" aria-modal="true" aria-label={copy.issue} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') closeIssue(); }}>
      <header><button className="close" onClick={closeIssue} aria-label={copy.close}>×</button><a href={issueUrl(selected.id)} target="_blank" rel="noreferrer">{selected.key || `#${selected.id}`}</a><h2>{selected.subject}</h2><p>{selected.status?.name} · {selected.priority?.name}</p><a href={issueUrl(selected.id)} target="_blank" rel="noreferrer">{copy.open}</a></header>
      <p>{selected.project?.name}{hierarchies[selected.id]?.epic ? ` → ${hierarchies[selected.id].epic.subject}` : ''}{hierarchies[selected.id]?.parent ? ` → ${hierarchies[selected.id].parent.subject}` : ''}</p>
      {detailLoading && <p>{copy.details}</p>}{detailError && <p className="error" role="alert">{copy.detailsError}: {detailError}</p>}
      <p>{copy.author}: {details?.author?.name || selected.author?.name || '—'} · {copy.assignee}: {details?.assigned_to?.name || selected.assigned_to?.name || '—'}</p><p>{copy.estimate}: {selected.estimated_hours ? hoursText(selected.estimated_hours) : copy.needsEstimate} · {copy.spent}: {hoursText(selected.spent_hours)}</p>
      <h3>{copy.description}</h3><p className={`description ${expanded ? '' : 'collapsed'}`}>{details?.description || selected.description || '—'}</p>{(details?.description || selected.description || '').length > 250 && <button className="secondary" onClick={() => setExpanded(!expanded)}>{expanded ? copy.collapse : copy.expand}</button>}
      <h3>{copy.comments}</h3>{(details?.journals || []).filter(journal => journal.notes).map(journal => <article className="comment" key={journal.id}><strong>{journal.user?.name || '—'}</strong> · {dateText(journal.created_on)}<p>{journal.notes}</p></article>)}<p>{copy.timeReadOnly}</p>
    </aside></div>}
    {showStatuses && <div className="overlay" onClick={() => setShowStatuses(false)}><section className="status-dialog" role="dialog" aria-modal="true" aria-label={copy.configuredStatuses} onClick={e => e.stopPropagation()}><h2>{copy.configuredStatuses}</h2><p>{copy.statusHint}</p><form onSubmit={saveStatuses}>{statusFields.map(field => <label key={field}>{copy[field]}<input value={statusDraft[field] || ''} onChange={e => setStatusDraft({ ...statusDraft, [field]: e.target.value })} /></label>)}{statusError && <p className="error" role="alert">{statusError}</p>}<div><button type="submit">{copy.save}</button> <button type="button" className="secondary" onClick={() => setShowStatuses(false)}>{copy.cancel}</button></div></form></section></div>}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
