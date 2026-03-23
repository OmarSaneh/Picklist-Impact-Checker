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

const SF_TIMEOUT_MS = 30_000;

export async function sfFetch(path, opts = {}) {
  const { instanceUrl, sid } = await getSession();
  const url = path.startsWith('http') ? path : `${instanceUrl}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SF_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${sid}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out (30 s). Check your network and try again.');
    throw new Error('Network error — check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('Your Salesforce session has expired. Please refresh your Salesforce tab and try again.');
    if (res.status === 403) throw new Error("You don't have permission to access this metadata. Check your profile or permission set.");
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`SF API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

let _orgName = null;

export async function getOrgName() {
  if (_orgName) return _orgName;
  try {
    const data = await sfFetch('/services/data/v59.0/query?q=SELECT+Name+FROM+Organization+LIMIT+1');
    _orgName = data.records?.[0]?.Name || null;
  } catch { }
  return _orgName;
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

export async function soapMetadata(instanceUrl, sid, body) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header><met:SessionHeader><met:sessionId>${sid}</met:sessionId></met:SessionHeader></soapenv:Header>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`;
  const result = await chrome.runtime.sendMessage({ type: 'SOAP_METADATA', instanceUrl, body: envelope });
  if (result.error) throw new Error(result.error);
  const xml = result.xml;
  if (xml.includes('soapenv:Fault') || xml.includes(':Fault>')) {
    const msg = xml.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] || xml.slice(0, 300);
    throw new Error(`SOAP fault: ${msg}`);
  }
  return xml;
}

export async function restQuery(soql) {
  const data = await sfFetch(`/services/data/v59.0/query?q=${encodeURIComponent(soql)}`);
  return data.records || [];
}

export async function restQueryAll(soql) {
  let url = `/services/data/v59.0/query?q=${encodeURIComponent(soql)}`;
  const all = [];
  while (url) { const d = await sfFetch(url); all.push(...(d.records || [])); url = d.nextRecordsUrl || null; }
  return all;
}
