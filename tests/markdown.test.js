import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUrl } from '../src/markdown.js';

test('resolveUrl allows web, mail and redmine-relative links', () => {
  assert.equal(resolveUrl('https://example.com/a', 'https://redmine.test'), 'https://example.com/a');
  assert.equal(resolveUrl('mailto:a@b.c', 'https://redmine.test'), 'mailto:a@b.c');
  assert.equal(resolveUrl('/issues/1', 'https://redmine.test/'), 'https://redmine.test/issues/1');
  assert.equal(resolveUrl('attachments/1/file.png', 'https://redmine.test'), 'https://redmine.test/attachments/1/file.png');
  assert.equal(resolveUrl('javascript:alert(1)', 'https://redmine.test'), null);
  assert.equal(resolveUrl('data:text/html,x', 'https://redmine.test'), null);
  assert.equal(resolveUrl('//evil.test/a', 'https://redmine.test'), null);
  assert.equal(resolveUrl('#section', 'https://redmine.test'), null);
  assert.equal(resolveUrl('', 'https://redmine.test'), null);
});
