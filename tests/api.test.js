import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/api.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const settings = { apiKey: 'test-key', redmineUrl: 'https://example.test/' };

test('sends credentials and Redmine payload with a normalized URL', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://example.test/time_entries.json');
    assert.equal(options.headers['X-Redmine-API-Key'], 'test-key');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { time_entry: { hours: '1' } });
    return new Response(null, { status: 204 });
  };
  assert.equal(await request(settings, '/time_entries.json', 'POST', { time_entry: { hours: '1' } }), null);
});

test('propagates API failures so the form is not cleared', async () => {
  globalThis.chrome = { i18n: { getMessage: () => 'API error' } };
  globalThis.fetch = async () => new Response(null, { status: 403 });
  await assert.rejects(request(settings, 'issues/1.json'), /API error/);
});
