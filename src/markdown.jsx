import React from 'react';
import DOMPurify from 'dompurify';
import { resolveUrl } from './markdown.js';

export function prepareHtml(html, baseUrl) {
  const clean = DOMPurify.sanitize(String(html || ''), { USE_PROFILES: { html: true } });
  if (!baseUrl) return clean;
  const document = new DOMParser().parseFromString(clean, 'text/html');
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href?.startsWith('#')) return;
    const resolved = resolveUrl(href, baseUrl);
    if (!resolved) { link.removeAttribute('href'); return; }
    link.setAttribute('href', resolved);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noreferrer');
  });
  document.querySelectorAll('img[src]').forEach(image => {
    const src = resolveUrl(image.getAttribute('src'), baseUrl);
    if (!src) { image.removeAttribute('src'); return; }
    image.setAttribute('src', src);
    image.setAttribute('loading', 'lazy');
    image.setAttribute('referrerpolicy', 'no-referrer');
  });
  return document.body.innerHTML;
}

export function Markdown({ text, html, baseUrl }) {
  const prepared = React.useMemo(() => html ? prepareHtml(html, baseUrl) : '', [html, baseUrl]);
  if (prepared) return <div className="markdown-html" dangerouslySetInnerHTML={{ __html: prepared }} />;
  if (!text) return null;
  return <div className="markdown-plain">{String(text)}</div>;
}
