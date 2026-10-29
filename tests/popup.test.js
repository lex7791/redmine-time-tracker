import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const messages = JSON.parse(readFileSync('_locales/ru/messages.json', 'utf8'));
async function bundle(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } });
  return result.outputFiles[0].text;
}
const [script, settingsScript] = await Promise.all([bundle('src/main.jsx'), bundle('src/settings.jsx')]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error('Timed out waiting for the popup');
}
function setValue(window, element, value) {
  const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

async function setup({ initialSettings = true } = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://extension.test/popup.html', runScripts: 'outside-only' });
  const { window } = dom;
  const calls = [];
  const alerts = [];
  const settings = initialSettings ? { redmineUrl: 'https://redmine.test', apiKey: 'secret' } : {};
  let entries = [{ id: 10, issue: { id: 42 }, spent_on: new Date().toLocaleDateString('en-CA'), hours: 1.5, activity: { id: 7 }, comments: 'Исходный комментарий' }];
  const listeners = new Set();
  const windows = [];
  const tabs = [];
  let failRefresh = false;
  let failWrite = false;
  window.chrome = {
    i18n: { getUILanguage: () => 'ru', getMessage: (key, substitutions) => (messages[key]?.message || '').replace(/\$(\d)/g, (_, n) => substitutions?.[n - 1] || '') },
    storage: { sync: { get: async () => ({ ...settings }), set: async next => Object.assign(settings, next) }, onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) } },
    windows: { create: async options => { windows.push(options); } },
    tabs: { create: async options => { tabs.push(options); } },
    runtime: { getURL: path => `chrome-extension://test/${path}` },
  };
  window.alert = message => alerts.push(message);
  window.fetch = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, search: parsed.search, method: options.method, body: options.body && JSON.parse(options.body) });
    let data;
    if (failWrite && options.method === 'POST') { failWrite = false; return { ok: false }; }
    if (parsed.pathname === '/enumerations/time_entry_activities.json') data = { time_entry_activities: [{ id: 7, name: 'Разработка' }] };
    else if (parsed.pathname === '/time_entries.json' && options.method === 'GET') {
      if (failRefresh) { failRefresh = false; return { ok: false }; }
      const from = parsed.searchParams.get('from');
      const to = parsed.searchParams.get('to');
      data = { time_entries: entries.filter(entry => entry.spent_on >= from && entry.spent_on <= to) };
    } else if (parsed.pathname === '/issues.json') data = { issues: [{ id: 42, key: 'TMS-42', subject: 'Задача для проверки' }] };
    else if (parsed.pathname === '/issues/TMS-42.json') data = { issue: { id: 42 } };
    else if (parsed.pathname === '/time_entries.json' && options.method === 'POST') {
      const entry = JSON.parse(options.body).time_entry;
      entries.push({ id: 11, issue: { id: 42 }, spent_on: entry.spent_on, hours: Number(entry.hours), activity: { id: Number(entry.activity_id) }, comments: entry.comments });
    } else if (parsed.pathname === '/time_entries/10.json' && options.method === 'PUT') {
      const entry = JSON.parse(options.body).time_entry;
      entries = entries.map(existing => existing.id === 10 ? { ...existing, spent_on: entry.spent_on, hours: Number(entry.hours), comments: entry.comments } : existing);
    } else if (parsed.pathname === '/time_entries/10.json' && options.method === 'DELETE') entries = entries.filter(entry => entry.id !== 10);
    else throw new Error(`Unexpected request: ${options.method} ${url}`);
    return { ok: true, status: data ? 200 : 204, headers: { get: key => key === 'content-type' && data ? 'application/json' : null }, json: async () => data };
  };
  window.eval(script);
  await waitFor(() => window.document.querySelector('.toolbar'));
  if (initialSettings) await waitFor(() => window.document.querySelector('.time-entry'));
  else await waitFor(() => window.document.querySelector('.settings-notice'));
  return { window, document: window.document, calls, alerts, settings, windows, tabs, notify: changes => listeners.forEach(listener => listener(changes, 'sync')), failNextRefresh: () => { failRefresh = true; }, failNextWrite: () => { failWrite = true; }, close: () => window.close() };
}

function click(window, element) { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }
function inputs(document) { return document.querySelectorAll('.fast-creation input'); }

test('загрузка настроек, недели, активности, копирование, добавление, редактирование и удаление', async () => {
  const app = await setup();
  const { window, document, calls } = app;
  try {
    assert.equal(document.querySelector('.toolbar input'), null);
    click(window, document.querySelector('.settings-button'));
    await waitFor(() => app.windows.length === 1);
    assert.equal(app.windows[0].url, 'chrome-extension://test/settings.html');
    assert.equal(app.windows[0].type, 'popup');
    click(window, [...document.querySelectorAll('.toolbar-actions button')][1]);
    await waitFor(() => app.tabs.length === 1);
    assert.equal(app.tabs[0].url, 'chrome-extension://test/dashboard.html');
    assert.equal(app.windows.length, 1);
    assert.equal(document.querySelectorAll('.day-column').length, 7);
    assert.equal(document.querySelector('.entry-key').textContent, 'TMS-42');
    assert.equal(document.querySelector('.entry-hour').textContent, '1ч 30м');
    assert.equal(document.querySelector('select option[value="7"]').textContent, 'Разработка');
    click(window, document.querySelector('.copy-btn'));
    await waitFor(() => inputs(document)[1].value === 'TMS-42');
    assert.equal(inputs(document)[2].value, '1.5');
    assert.equal(inputs(document)[3].value, 'Исходный комментарий');
    assert.equal(document.querySelector('select').value, '7');
    click(window, document.querySelector('.secondary'));
    await waitFor(() => calls.some(call => call.method === 'POST'));
    await waitFor(() => document.querySelectorAll('.time-entry').length === 2);
    const post = calls.find(call => call.method === 'POST');
    assert.deepEqual(post.body.time_entry, { issue_id: 42, spent_on: inputs(document)[0].value, hours: '1.5', activity_id: '7', comments: 'Исходный комментарий' });
    await waitFor(() => inputs(document)[1].value === '');
    click(window, document.querySelector('.edit-btn'));
    await waitFor(() => document.querySelector('.secondary').textContent === 'Изменить');
    setValue(window, inputs(document)[2], '2');
    click(window, document.querySelector('.secondary'));
    await waitFor(() => calls.some(call => call.method === 'PUT'));
    await waitFor(() => document.querySelector('.entry-hour').textContent === '2ч');
    assert.equal(calls.find(call => call.method === 'PUT').body.time_entry.hours, '2');
    click(window, document.querySelector('.delete-btn'));
    await waitFor(() => calls.some(call => call.method === 'DELETE'));
    await waitFor(() => document.querySelectorAll('.time-entry').length === 1);
    const before = calls.filter(call => call.path === '/time_entries.json' && call.method === 'GET').length;
    click(window, document.querySelector('.week-info button'));
    await waitFor(() => calls.filter(call => call.path === '/time_entries.json' && call.method === 'GET').length > before);
    await waitFor(() => document.querySelectorAll('.time-entry').length === 0);
    assert.equal(document.querySelectorAll('.no-entries').length, 7);
  } finally { app.close(); }
});

test('окно настроек сохраняет прежние ключи и popup подхватывает изменения', async () => {
  const app = await setup({ initialSettings: false });
  const settingsDom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://extension.test/settings.html', runScripts: 'outside-only' });
  const settingsWindow = settingsDom.window;
  try {
    click(app.window, app.document.querySelector('.settings-link'));
    await waitFor(() => app.windows.length === 1);
    settingsWindow.chrome = {
      i18n: app.window.chrome.i18n,
      storage: { sync: {
        get: async () => ({ ...app.settings }),
        set: async next => { Object.assign(app.settings, next); app.notify({ redmineUrl: { newValue: next.redmineUrl }, apiKey: { newValue: next.apiKey } }); },
      } },
    };
    settingsWindow.eval(settingsScript);
    await waitFor(() => settingsWindow.document.querySelector('button:not([disabled])'));
    const fields = settingsWindow.document.querySelectorAll('input');
    setValue(settingsWindow, fields[0], 'https://redmine.test');
    setValue(settingsWindow, fields[1], 'secret');
    click(settingsWindow, settingsWindow.document.querySelector('button'));
    await waitFor(() => app.document.querySelector('.time-entry'));
    assert.deepEqual(app.settings, { redmineUrl: 'https://redmine.test', apiKey: 'secret' });
    assert.ok(settingsWindow.document.querySelector('[role="status"]'));
    assert.equal(app.document.querySelector('.settings-notice'), null);
  } finally { settingsWindow.close(); app.close(); }
});

test('окно настроек показывает сохранённые значения и проверяет обязательные поля', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only' });
  const { window } = dom;
  const saved = { redmineUrl: 'https://redmine.test', apiKey: 'existing' };
  let writes = 0;
  window.chrome = { i18n: { getMessage: key => messages[key]?.message || '' }, storage: { sync: { get: async () => saved, set: async () => { writes++; } } } };
  try {
    window.eval(settingsScript);
    await waitFor(() => window.document.querySelector('button:not([disabled])'));
    const fields = window.document.querySelectorAll('input');
    assert.equal(fields[0].value, saved.redmineUrl);
    assert.equal(fields[1].value, saved.apiKey);
    assert.equal(fields[1].type, 'password');
    setValue(window, fields[1], '');
    click(window, window.document.querySelector('button'));
    await waitFor(() => window.document.querySelector('[role="alert"]'));
    assert.equal(writes, 0);
  } finally { window.close(); }
});

test('после успешного сохранения и ошибки обновления форма очищается', async () => {
  const app = await setup();
  try {
    click(app.window, app.document.querySelector('.copy-btn'));
    await waitFor(() => inputs(app.document)[1].value === 'TMS-42');
    app.failNextRefresh();
    click(app.window, app.document.querySelector('.secondary'));
    await waitFor(() => app.document.querySelector('.error'));
    await waitFor(() => inputs(app.document)[1].value === '');
    assert.equal(app.calls.filter(call => call.method === 'POST').length, 1);
  } finally { app.close(); }
});


test('при отказе Redmine форма сохраняет введённые данные', async () => {
  const app = await setup();
  try {
    click(app.window, app.document.querySelector('.copy-btn'));
    await waitFor(() => inputs(app.document)[1].value === 'TMS-42');
    app.failNextWrite();
    click(app.window, app.document.querySelector('.secondary'));
    await waitFor(() => app.document.querySelector('.error'));
    assert.equal(inputs(app.document)[1].value, 'TMS-42');
    assert.equal(inputs(app.document)[2].value, '1.5');
    assert.equal(inputs(app.document)[3].value, 'Исходный комментарий');
  } finally { app.close(); }
});
