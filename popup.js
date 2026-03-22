/* ─────────────────────────────────────────────────────────────────────────
   Picklist Impact Checker — popup.js
   All extension logic: session detection, pickers, scan, render.
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  instanceUrl: null,   // e.g. "https://myorg.my.salesforce.com"
  sid: null,           // Salesforce session id
  describeCache: {},   // objectName → describe result
  selectedObject: null,
  selectedField: null,
  selectedValue: null,
  flowLimitReached: false,
};

// ── DOM helpers ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Split array into chunks of size n */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Return up to maxSnippets matching lines from body that contain value,
 * each trimmed to maxLen characters.
 */
function getMatchingSnippets(body, value, maxSnippets = 3, maxLen = 150) {
  if (!body) return [];
  const lines = body.split('\n');
  const snippets = [];
  for (const line of lines) {
    if (line.includes(value)) {
      snippets.push(line.trim().slice(0, maxLen));
      if (snippets.length >= maxSnippets) break;
    }
  }
  return snippets;
}

// ── API helpers ────────────────────────────────────────────────────────────

/** Generic SF REST fetch. Returns parsed JSON or throws. */
async function sfFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${state.instanceUrl}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${state.sid}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`SF API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Run a single Tooling API SOQL query. Returns records[]. */
async function toolingQuery(soql) {
  const encoded = encodeURIComponent(soql);
  const data = await sfFetch(`/services/data/v59.0/tooling/query?q=${encoded}`);
  return data.records || [];
}

/**
 * Run a Tooling SOQL query with pagination (nextRecordsUrl).
 * Returns all records across all pages.
 */
async function toolingQueryAll(soql) {
  const encoded = encodeURIComponent(soql);
  let url = `/services/data/v59.0/tooling/query?q=${encoded}`;
  const allRecords = [];

  while (url) {
    const data = await sfFetch(url);
    allRecords.push(...(data.records || []));
    url = data.nextRecordsUrl || null;
  }

  return allRecords;
}

// ── Session detection ──────────────────────────────────────────────────────

/**
 * Attempt to find a Salesforce session from the active tab.
 * Returns { instanceUrl, sid } or throws.
 */
async function detectSession() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url) throw new Error('NO_TAB');

  const tabUrl = new URL(tab.url);
  const hostname = tabUrl.hostname;

  const isSF =
    hostname.endsWith('.salesforce.com') ||
    hostname.endsWith('.force.com') ||
    hostname.endsWith('.my.salesforce.com') ||
    hostname.endsWith('.lightning.force.com') ||
    hostname.endsWith('.sandbox.my.salesforce.com');

  if (!isSF) throw new Error('NOT_SF');

  // Lightning Force.com is a UI shell — REST API must go to the My Domain URL.
  // e.g. myorg--dev.lightning.force.com → myorg--dev.my.salesforce.com
  let apiHostname = hostname;
  if (hostname.endsWith('.lightning.force.com')) {
    apiHostname = hostname.replace('.lightning.force.com', '.my.salesforce.com');
  }
  const instanceUrl = `https://${apiHostname}`;

  // When on Lightning (*.lightning.force.com), the sid cookie there is a
  // UI-only session — Salesforce explicitly rejects it for REST API calls.
  // The API-valid session lives on the My Domain (*.my.salesforce.com).
  // So when on Lightning, search the My Domain cookie ONLY.
  // For all other SF domains, try the tab URL first, then the API URL.
  const cookieSearchUrls = hostname.endsWith('.lightning.force.com')
    ? [instanceUrl]
    : [...new Set([`https://${hostname}`, instanceUrl])];

  let cookie = null;
  for (const url of cookieSearchUrls) {
    cookie = await chrome.cookies.get({ url, name: 'sid' });
    if (cookie) break;
  }

  if (!cookie) {
    // Last resort: getAll and pick the best match
    const allCookies = await chrome.cookies.getAll({ name: 'sid' });
    const sfCookies = allCookies.filter(c => {
      const d = c.domain.replace(/^\./, '');
      return d.endsWith('salesforce.com') || d.endsWith('force.com');
    });
    // Prefer a cookie whose domain is part of our org's hostname
    const exact = sfCookies.find(c =>
      apiHostname.includes(c.domain.replace(/^\./, ''))
    );
    cookie = exact || sfCookies[0] || null;
  }

  if (!cookie) throw new Error('NO_COOKIE');

  // SF session IDs are URL-encoded in the cookie (! → %21). Always decode.
  const sid = decodeURIComponent(cookie.value);

  return { instanceUrl, sid };
}

/** Verify session by calling limits endpoint. */
async function verifySession() {
  await sfFetch('/services/data/v59.0/limits');
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  init();
});

function setupEventListeners() {
  $('object-select').addEventListener('change', onObjectChange);
  $('field-select').addEventListener('change', onFieldChange);
  $('retry-btn').addEventListener('click', init);
  $('new-scan-btn').addEventListener('click', resetToForm);
}

async function init() {
  // Reset UI
  hide('not-sf-state');
  hide('session-error-state');
  hide('picker-form');
  hide('progress-section');
  hide('results-section');
  hide('org-bar');
  $('connection-badge').className = 'badge badge-checking';
  $('connection-badge').textContent = 'Checking…';

  try {
    const { instanceUrl, sid } = await detectSession();
    state.instanceUrl = instanceUrl;
    state.sid = sid;

    await verifySession();

    // Connected
    $('connection-badge').className = 'badge badge-connected';
    $('connection-badge').textContent = '● Connected';
    $('org-hostname').textContent = new URL(instanceUrl).hostname;
    show('org-bar');

    show('picker-form');
    await populateObjects();

  } catch (err) {
    $('connection-badge').className = 'badge badge-error';
    $('connection-badge').textContent = '✕ Error';

    if (err.message === 'NO_TAB' || err.message === 'NOT_SF') {
      show('not-sf-state');
    } else {
      $('session-error-msg').textContent =
        err.message === 'NO_COOKIE'
          ? 'No Salesforce session cookie found. Please log in to your org first.'
          : `Could not verify session: ${err.message}`;
      show('session-error-state');
    }
  }
}

// ── Pickers ────────────────────────────────────────────────────────────────

async function populateObjects() {
  const sel = $('object-select');
  sel.innerHTML = '<option value="">Loading objects…</option>';
  sel.disabled = true;

  try {
    const data = await sfFetch('/services/data/v59.0/sobjects/');
    const objects = (data.sobjects || [])
      .filter(o => o.queryable && o.createable)
      .sort((a, b) => a.label.localeCompare(b.label));

    sel.innerHTML = '<option value="">— Select an object —</option>';
    for (const obj of objects) {
      const opt = document.createElement('option');
      opt.value = obj.name;
      opt.textContent = `${obj.label} (${obj.name})`;
      sel.appendChild(opt);
    }
    sel.disabled = false;
  } catch (err) {
    sel.innerHTML = `<option value="">Error loading objects: ${escapeHtml(err.message)}</option>`;
  }
}

async function onObjectChange() {
  const objName = $('object-select').value;
  state.selectedObject = objName;
  state.selectedField = null;
  state.selectedValue = null;

  // Hide downstream steps
  hide('step-field');
  hide('step-value');

  const fieldSel = $('field-select');
  fieldSel.innerHTML = '<option value="">— Select a field —</option>';
  fieldSel.disabled = true;

  $('value-list').innerHTML = '';

  if (!objName) return;

  fieldSel.innerHTML = '<option value="">Loading fields…</option>';
  show('step-field');

  try {
    let describe = state.describeCache[objName];
    if (!describe) {
      describe = await sfFetch(`/services/data/v59.0/sobjects/${objName}/describe/`);
      state.describeCache[objName] = describe;
    }

    const picklistFields = (describe.fields || [])
      .filter(f => f.type === 'picklist' || f.type === 'multipicklist')
      .sort((a, b) => a.label.localeCompare(b.label));

    fieldSel.innerHTML = '<option value="">— Select a picklist field —</option>';
    if (picklistFields.length === 0) {
      fieldSel.innerHTML = '<option value="">No picklist fields found</option>';
    } else {
      for (const f of picklistFields) {
        const opt = document.createElement('option');
        opt.value = f.name;
        opt.textContent = `${f.label} (${f.name})`;
        fieldSel.appendChild(opt);
      }
      fieldSel.disabled = false;
    }
  } catch (err) {
    fieldSel.innerHTML = `<option value="">Error: ${escapeHtml(err.message)}</option>`;
  }
}

function onFieldChange() {
  const objName = state.selectedObject;
  const fieldName = $('field-select').value;
  state.selectedField = fieldName;
  state.selectedValue = null;

  hide('step-value');

  const list = $('value-list');
  list.innerHTML = '';

  if (!fieldName) return;

  const describe = state.describeCache[objName];
  const field = (describe.fields || []).find(f => f.name === fieldName);
  if (!field) return;

  const values = field.picklistValues || [];

  values.forEach(v => {
    const row = document.createElement('div');
    row.className = 'value-row';

    const label = document.createElement('span');
    label.className = 'value-row-label';
    label.textContent = v.label;

    if (!v.active) {
      const tag = document.createElement('span');
      tag.className = 'value-inactive-tag';
      tag.textContent = '(inactive)';
      label.appendChild(tag);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-scan';
    btn.textContent = 'Scan';
    btn.addEventListener('click', () => runScan(v.value));

    row.appendChild(label);
    row.appendChild(btn);
    list.appendChild(row);
  });

  show('step-value');
}

// ── Scan ───────────────────────────────────────────────────────────────────

function setProgress(pct, label) {
  $('progress-bar').style.width = `${pct}%`;
  $('progress-label').textContent = label;
}

async function runScan(valueOverride) {
  const obj = state.selectedObject;
  const value = valueOverride ?? state.selectedValue;

  // Show progress, hide form
  hide('picker-form');
  hide('results-section');
  show('progress-section');
  state.flowLimitReached = false;

  setProgress(0, 'Starting scan…');

  const allResults = {
    'Validation Rules': [],
    'Formula Fields': [],
    'Flows': [],
    'Apex Classes': [],
    'Apex Triggers': [],
    'Workflow Rules': [],
  };

  const steps = [
    { key: 'Validation Rules', pct: 5,  label: 'Scanning validation rules…', fn: () => scanValidationRules(obj, value) },
    { key: 'Formula Fields',   pct: 22, label: 'Scanning formula fields…',   fn: () => scanFormulaFields(obj, value) },
    { key: 'Flows',            pct: 38, label: 'Scanning active flows…',      fn: () => scanFlows(value) },
    { key: 'Apex Classes',     pct: 58, label: 'Scanning Apex classes…',      fn: () => scanApexClasses(value) },
    { key: 'Apex Triggers',    pct: 78, label: 'Scanning Apex triggers…',     fn: () => scanApexTriggers(value) },
    { key: 'Workflow Rules',   pct: 90, label: 'Scanning workflow rules…',    fn: () => scanWorkflowRules(obj, value) },
  ];

  for (const step of steps) {
    setProgress(step.pct, step.label);
    try {
      allResults[step.key] = await step.fn();
    } catch (err) {
      // Record the error as a pseudo-result so the user sees it, continue scanning
      allResults[step.key] = [{ id: '', name: `⚠ Error: ${err.message}`, snippets: [], linkType: null }];
    }
  }

  setProgress(100, 'Scan complete.');

  // Brief pause so user sees "100%"
  await new Promise(r => setTimeout(r, 400));

  hide('progress-section');
  renderResults(allResults, obj, value);
}

// ── Scanners ───────────────────────────────────────────────────────────────

async function scanValidationRules(objName, value) {
  // Tooling API: selecting Metadata restricts the query to 1 row max.
  // Step 1: fetch all VR IDs + names for this object (no Metadata).
  const list = await toolingQuery(
    `SELECT Id, ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objName}'`
  );

  const results = [];
  // Step 2: fetch Metadata one record at a time.
  for (const vr of list) {
    try {
      const detail = await toolingQuery(
        `SELECT Id, ValidationName, Metadata FROM ValidationRule WHERE Id = '${vr.Id}'`
      );
      if (!detail.length) continue;
      const formula = detail[0].Metadata?.errorConditionFormula || '';
      if (formula.includes(value)) {
        results.push({
          id: vr.Id,
          name: vr.ValidationName,
          snippets: getMatchingSnippets(formula, value),
          linkType: 'ValidationRule',
        });
      }
    } catch {
      // Skip individual errors
    }
  }
  return results;
}

async function scanFormulaFields(objName, value) {
  const soql = `SELECT Id, DeveloperName, Metadata FROM CustomField WHERE TableEnumOrId = '${objName}'`;
  let records;
  try {
    records = await toolingQuery(soql);
  } catch {
    return []; // Some orgs restrict Metadata field; skip gracefully
  }

  const results = [];
  for (const r of records) {
    const formula = r.Metadata && r.Metadata.formula ? r.Metadata.formula : '';
    if (formula.includes(value)) {
      results.push({
        id: r.Id,
        name: r.DeveloperName,
        snippets: getMatchingSnippets(formula, value),
        linkType: 'FormulaField',
      });
    }
  }
  return results;
}

/**
 * Walk Flow Metadata and pull readable context snippets for the value.
 * Looks in: decision rules (conditions/formulas), assignments, record filters,
 * and any string literal inside the metadata — but formats them as human-readable
 * labels instead of raw JSON.
 */
function extractFlowSnippets(meta, value) {
  const hits = [];

  // Collect label+context pairs from known flow node types
  const nodeTypes = [
    'decisions', 'assignments', 'recordLookups', 'recordCreates',
    'recordUpdates', 'recordDeletes', 'loops', 'screens', 'actionCalls',
    'subflows', 'waits', 'customErrors',
  ];

  for (const nodeType of nodeTypes) {
    const nodes = meta[nodeType];
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      // Stringify just this node to check if value appears, then label it cleanly
      const nodeStr = JSON.stringify(node);
      if (nodeStr.includes(value)) {
        const label = node.label || node.name || nodeType;
        hits.push(`${nodeType}: "${label}"`);
        if (hits.length >= 3) return hits;
      }
    }
  }

  // Fallback: check formulas / process metadata at top level
  const topLevelStr = JSON.stringify(meta);
  if (hits.length === 0 && topLevelStr.includes(value)) {
    hits.push('Found in flow metadata (open Flow Builder for details)');
  }

  return hits;
}

async function scanFlows(value) {
  // Step 1: list active flows (cap at 50)
  const listSoql = `SELECT Id, MasterLabel, ProcessType FROM Flow WHERE Status = 'Active' LIMIT 50`;
  let flowList;
  try {
    flowList = await toolingQuery(listSoql);
  } catch {
    return [];
  }

  if (flowList.length >= 50) state.flowLimitReached = true;

  const results = [];
  // Step 2: fetch Metadata for each flow individually (Salesforce requirement)
  for (const flow of flowList) {
    try {
      const detail = await toolingQuery(
        `SELECT Id, MasterLabel, Metadata FROM Flow WHERE Id = '${flow.Id}'`
      );
      if (!detail.length) continue;
      const meta = detail[0].Metadata || {};

      // Search only the meaningful text-bearing fields — not the full JSON blob.
      const snippets = extractFlowSnippets(meta, value);
      if (snippets.length > 0) {
        results.push({
          id: flow.Id,
          name: flow.MasterLabel,
          snippets,
          linkType: 'Flow',
        });
      }
    } catch {
      // Skip individual flow errors
    }
  }
  return results;
}

async function scanApexClasses(value) {
  const soql = `SELECT Id, Name, Body FROM ApexClass`;
  let records;
  try {
    records = await toolingQueryAll(soql);
  } catch {
    return [];
  }
  return records
    .filter(r => (r.Body || '').includes(value))
    .map(r => ({
      id: r.Id,
      name: r.Name,
      snippets: getMatchingSnippets(r.Body, value),
      linkType: 'ApexClass',
    }));
}

async function scanApexTriggers(value) {
  const soql = `SELECT Id, Name, Body FROM ApexTrigger WHERE Status = 'Active'`;
  let records;
  try {
    records = await toolingQueryAll(soql);
  } catch {
    return [];
  }
  return records
    .filter(r => (r.Body || '').includes(value))
    .map(r => ({
      id: r.Id,
      name: r.Name,
      snippets: getMatchingSnippets(r.Body, value),
      linkType: 'ApexTrigger',
    }));
}

async function scanWorkflowRules(objName, value) {
  // TableEnumOrId accepts the API name for standard objects and the 15-char ID for custom.
  // Also try EntityDefinition.QualifiedApiName traversal if available.
  const soql = `SELECT Id, Name, Metadata FROM WorkflowRule WHERE TableEnumOrId = '${objName}'`;
  let records;
  try {
    records = await toolingQuery(soql);
  } catch {
    return [];
  }
  return records
    .filter(r => JSON.stringify(r.Metadata || '').includes(value))
    .map(r => ({
      id: r.Id,
      name: r.Name,
      snippets: getMatchingSnippets(JSON.stringify(r.Metadata || ''), value),
      linkType: 'WorkflowRule',
    }));
}

// ── Render ─────────────────────────────────────────────────────────────────

function buildSetupUrl(type, id, objName) {
  const base = state.instanceUrl;
  // Setup UI pages are served from salesforce-setup.com, not the API domain.
  // e.g. myorg.sandbox.my.salesforce.com → myorg.sandbox.my.salesforce-setup.com
  const setupBase = base.replace('.salesforce.com', '.salesforce-setup.com');
  switch (type) {
    case 'ValidationRule':
      return `${setupBase}/lightning/setup/ObjectManager/${objName}/ValidationRules/${id}/view`;
    case 'FormulaField':
      return `${setupBase}/lightning/setup/ObjectManager/${objName}/FieldsAndRelationships/view`;
    case 'Flow':
      // Flow Builder lives on the org domain, not the Setup domain
      return `${base}/builder_platform_interaction/flowBuilder.app?flowId=${id}`;
    case 'ApexClass':
      return `${setupBase}/lightning/setup/ApexClasses/home`;
    case 'ApexTrigger':
      return `${setupBase}/lightning/setup/ApexTriggers/home`;
    case 'WorkflowRule':
      return `${setupBase}/lightning/setup/WorkflowRules/home`;
    default:
      return base;
  }
}

function renderResults(allResults, objName, value) {
  show('results-section');

  // Count only real matches (not error sentinel entries which have linkType: null)
  const totalHits = Object.values(allResults).reduce(
    (s, arr) => s + arr.filter(r => r.linkType !== null).length, 0
  );

  // Summary line
  $('results-summary').textContent =
    totalHits === 0
      ? `No references found for "${value}"`
      : `${totalHits} reference${totalHits !== 1 ? 's' : ''} found for "${value}"`;

  // Flow limit notice
  if (state.flowLimitReached) show('flow-limit-notice');
  else hide('flow-limit-notice');

  const list = $('results-list');
  list.innerHTML = '';

  if (totalHits === 0) {
    show('empty-state');
    return;
  }
  hide('empty-state');

  for (const [typeName, items] of Object.entries(allResults)) {
    if (items.length === 0) continue;

    const group = document.createElement('div');
    group.className = 'result-group';

    // Header (collapsible)
    const header = document.createElement('div');
    header.className = 'result-group-header';
    header.innerHTML = `
      <span class="result-type-label">${escapeHtml(typeName)}</span>
      <span class="result-count-badge">${items.length}</span>
    `;

    const body = document.createElement('div');
    body.className = 'result-group-body';

    header.addEventListener('click', () => {
      body.style.display = body.style.display === 'none' ? '' : 'none';
    });

    for (const item of items) {
      const div = document.createElement('div');
      div.className = 'result-item';

      const url = item.linkType ? buildSetupUrl(item.linkType, item.id, objName) : null;
      const nameHtml = url
        ? `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(item.name)}</a>`
        : `<span style="color:var(--sf-orange)">${escapeHtml(item.name)}</span>`;
      let html = `<div class="result-item-name">${nameHtml}</div>`;

      for (const snippet of item.snippets) {
        html += `<div class="result-snippet">${escapeHtml(snippet)}</div>`;
      }

      div.innerHTML = html;
      body.appendChild(div);
    }

    group.appendChild(header);
    group.appendChild(body);
    list.appendChild(group);
  }
}

function resetToForm() {
  // Clear results
  hide('results-section');
  hide('progress-section');
  $('results-list').innerHTML = '';
  hide('flow-limit-notice');
  hide('empty-state');

  // Reset state
  state.selectedObject = null;
  state.selectedField = null;
  state.selectedValue = null;

  // Reset selects
  $('object-select').value = '';
  $('field-select').innerHTML = '<option value="">— Select a field —</option>';
  $('field-select').disabled = true;
  $('value-list').innerHTML = '';

  hide('step-field');
  hide('step-value');

  show('picker-form');
}
