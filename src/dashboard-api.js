import { request } from './api.js';

export const statusDefaults = {
  workingStatuses: 'Develop, Code Review',
  testingStatuses: 'Ready for testing, Testing',
  nextStatuses: 'Next, Следующие, Готово к работе, Ready',
  backlogStatuses: 'Backlog',
};

export function issueGroup(status, settings) {
  const name = String(status || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  for (const [group, field] of [['working', 'workingStatuses'], ['testing', 'testingStatuses'], ['next', 'nextStatuses']]) {
    const choices = `${settings[field] || ''},${statusDefaults[field]}`.split(',').map(value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()).filter(Boolean);
    if (choices.some(choice => name === choice || name.includes(choice))) return group;
  }
  return 'backlog';
}

export async function assignedIssues(settings) {
  const issues = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const data = await request(settings, `issues.json?assigned_to_id=me&status_id=open&limit=${limit}&offset=${offset}`);
    const page = data?.issues || [];
    issues.push(...page);
    const total = data?.total_count ?? issues.length;
    if (issues.length >= total) break;
    if (!page.length) throw new Error('Redmine returned an incomplete issue list');
    offset += page.length;
  }
  return issues;
}

export function createIssueLoader(settings) {
  const cache = new Map();
  return function load(id, details = false) {
    const path = `issues/${encodeURIComponent(id)}.json${details ? '?include=journals,children,relations' : ''}`;
    if (!cache.has(path)) cache.set(path, request(settings, path).catch(error => { cache.delete(path); throw error; }));
    return cache.get(path);
  };
}

export async function getHierarchy(issue, loadIssue) {
  const visited = new Set([issue.id]);
  let id = issue.parent?.id;
  let parent = null;
  let epic = null;
  for (let level = 0; id && level < 8 && !visited.has(id); level++) {
    visited.add(id);
    let item;
    try { item = (await loadIssue(id))?.issue; } catch { break; }
    if (!item) break;
    if (!parent) parent = item;
    if (!epic && /эпик|epic|фича|feature/i.test(item.tracker?.name || '')) epic = item;
    id = item.parent?.id;
  }
  return { parent, epic };
}
