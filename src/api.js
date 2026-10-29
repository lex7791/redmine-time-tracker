export async function request(settings, path, method = 'GET', body) {
  const response = await fetch(`${settings.redmineUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`, {
    method,
    headers: { 'X-Redmine-API-Key': settings.apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(chrome.i18n.getMessage('apiError') || 'API error');
  if (response.status === 204 || response.headers.get('content-length') === '0') return null;
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : null;
}
