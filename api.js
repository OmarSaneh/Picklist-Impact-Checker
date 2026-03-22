let _session = null;

export function getSessionCached() { return _session; }
export function setSession(s) { _session = s; }

export async function getSession() {
  if (_session) return _session;
  const result = await chrome.runtime.sendMessage({
    type: 'GET_SESSION',
    hostname: location.hostname,
  });
  if (result.error) throw new Error(result.error);
  _session = result;
  return _session;
}

export async function sfFetch(path, opts = {}) {
  const { instanceUrl, sid } = await getSession();
  const url = path.startsWith('http') ? path : `${instanceUrl}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${sid}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`SF API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function toolingQuery(soql) {
  const data = await sfFetch(`/services/data/v59.0/tooling/query?q=${encodeURIComponent(soql)}`);
  return data.records || [];
}

export async function toolingQueryAll(soql) {
  let url = `/services/data/v59.0/tooling/query?q=${encodeURIComponent(soql)}`;
  const all = [];
  while (url) { const d = await sfFetch(url); all.push(...(d.records || [])); url = d.nextRecordsUrl || null; }
  return all;
}
