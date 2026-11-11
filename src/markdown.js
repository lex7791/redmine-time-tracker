export function resolveUrl(value, baseUrl) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (url.startsWith('#') || url.startsWith('//') || /^[^:\s]+:/.test(url)) return null;
  return baseUrl ? `${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}` : null;
}
