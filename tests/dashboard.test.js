import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { assignedIssues, createIssueLoader, getHierarchy, issueGroup, statusDefaults } from '../src/dashboard-api.js';

const settings = { apiKey: 'key', redmineUrl: 'https://redmine.test', ...statusDefaults };
const response = data => ({ ok: true, status: 200, headers: { get: key => key === 'content-type' ? 'application/json' : null }, json: async () => data });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate) {
  for (let i = 0; i < 120; i++) { if (predicate()) return; await delay(10); }
  throw new Error('Timed out waiting for dashboard');
}
const click = (window, element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

test('загрузка всех страниц задач и защита от пустой страницы', async () => {
  const previous = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async url => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      requests++;
      return response(offset === 0 ? { issues: [{ id: 1 }, { id: 2 }], total_count: 3 } : { issues: [{ id: 3 }], total_count: 3 });
    };
    assert.deepEqual((await assignedIssues(settings)).map(item => item.id), [1, 2, 3]);
    assert.equal(requests, 2);
    globalThis.fetch = async () => response({ issues: [], total_count: 3 });
    await assert.rejects(assignedIssues(settings), /incomplete issue list/);
  } finally { globalThis.fetch = previous; }
});

test('группы статусов и повторное использование запросов к родителям', async () => {
  assert.equal(issueGroup('Code Review', settings), 'working');
  assert.equal(issueGroup('Testing', settings), 'testing');
  assert.equal(issueGroup('Ready', settings), 'next');
  assert.equal(issueGroup('Unknown', settings), 'backlog');
  assert.equal(issueGroup('My custom status', { ...settings, workingStatuses: 'My custom status' }), 'working');
  const previous = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return response({ issue: { id: 2, subject: 'Parent', parent: { id: 2 }, tracker: { name: 'Feature' } } }); };
    const load = createIssueLoader(settings);
    const [first, second] = await Promise.all([getHierarchy({ id: 1, parent: { id: 2 } }, load), getHierarchy({ id: 3, parent: { id: 2 } }, load)]);
    assert.equal(first.parent.subject, 'Parent');
    assert.equal(second.epic.subject, 'Parent');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});

test('окно задач показывает группы, фильтры, детали и сохраняет список при ошибке обновления', async () => {
  const bundle = await build({ entryPoints: ['src/dashboard.jsx'], bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://extension.test/dashboard.html', runScripts: 'outside-only' });
  const { window } = dom;
  const calls = [];
  let fail = false;
  const issues = [
    { id: 1, key: 'TMS-1', subject: 'Задача один', status: { id: 1, name: 'Develop' }, tracker: { name: 'Task' }, project: { name: 'Первый' }, priority: { name: 'High' }, parent: { id: 9 }, estimated_hours: null, spent_hours: 1, created_on: '2026-01-01T00:00:00Z' },
    { id: 2, key: 'TMS-2', subject: 'Задача два', status: { id: 2, name: 'Testing' }, tracker: { name: 'Bug' }, project: { name: 'Второй' }, priority: { name: 'Normal' }, estimated_hours: 2 },
  ];
  window.chrome = { i18n: { getUILanguage: () => 'ru', getMessage: () => 'Ошибка API' }, storage: { sync: { get: async () => settings, set: async values => Object.assign(settings, values) }, onChanged: { addListener: () => {}, removeListener: () => {} } }, windows: { create: async () => {} }, runtime: { getURL: path => path } };
  window.fetch = async (url, options) => {
    calls.push({ url, options });
    if (fail) return { ok: false };
    const path = new URL(url).pathname;
    if (path === '/issues.json') return response({ issues, total_count: issues.length });
    if (path === '/issues/9.json') return response({ issue: { id: 9, subject: 'Родитель', tracker: { name: 'Feature' } } });
    if (path === '/issues/1.json') return response({ issue: { ...issues[0], description: '<b>без HTML</b>', journals: [{ id: 11, user: { name: 'Автор' }, notes: 'Комментарий' }] } });
    throw new Error(`Unexpected ${url}`);
  };
  try {
    window.eval(bundle.outputFiles[0].text);
    const doc = window.document;
    await waitFor(() => doc.querySelector('tbody tr'));
    await waitFor(() => doc.querySelector('tbody tr').textContent.includes('Родитель'));
    assert.match(doc.querySelector('tbody tr').textContent, /TMS-1/);
    assert.equal(calls[0].options.headers['X-Redmine-API-Key'], 'key');
    click(window, doc.querySelector('tbody tr'));
    await waitFor(() => doc.querySelector('.comment'));
    assert.match(doc.querySelector('.issue-panel').textContent, /Комментарий/);
    assert.equal(doc.querySelector('.description').textContent, '<b>без HTML</b>');
    assert.equal(doc.querySelector('.description b'), null);
    click(window, doc.querySelector('.close'));
    click(window, [...doc.querySelectorAll('.dashboard-tabs button')][1]);
    await waitFor(() => doc.querySelector('tbody tr')?.textContent.includes('TMS-2'));
    const filters = doc.querySelectorAll('.dashboard-filters select');
    assert.match(filters[1].parentElement.textContent, /Тип задачи/);
    assert.match(doc.querySelector('.check').textContent, /Без оценки/);
    const check = doc.querySelector('.check input');
    click(window, check);
    await waitFor(() => doc.querySelectorAll('tbody tr').length === 0);
    click(window, doc.querySelector('.clear-filters'));
    await waitFor(() => doc.querySelector('tbody tr')?.textContent.includes('TMS-2'));
    assert.equal(check.checked, false);
    assert.deepEqual([...filters].map(filter => filter.value), ['', '', '']);
    fail = true;
    click(window, [...doc.querySelectorAll('.dashboard-header button')].at(-1));
    await waitFor(() => doc.querySelector('[role="alert"]'));
    assert.match(doc.querySelector('tbody tr').textContent, /TMS-2/);
    assert.equal(calls.every(call => call.options.method === 'GET'), true);
  } finally { window.close(); }
});
