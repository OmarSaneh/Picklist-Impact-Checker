/* ─────────────────────────────────────────────────────────────────────────
   Picklist Impact Checker — content.js
   Runs in two contexts:
   1. Main frame on salesforce-setup.com  → floating picker + context relay
   2. Child iframe on salesforce.com       → table row injection + panel
   ───────────────────────────────────────────────────────────────────────── */

import { getSession, setSession, sfFetch } from './api.js';
import { escapeHtml, buildSetupUrl } from './utils.js';
import { ValidationRuleScanner }  from './scanners/ValidationRuleScanner.js';
import { FormulaFieldScanner }    from './scanners/FormulaFieldScanner.js';
import { FlowScanner }            from './scanners/FlowScanner.js';
import { ApexClassScanner }       from './scanners/ApexClassScanner.js';
import { ApexTriggerScanner }     from './scanners/ApexTriggerScanner.js';
import { WorkflowRuleScanner }    from './scanners/WorkflowRuleScanner.js';
import { AuraComponentScanner }   from './scanners/AuraComponentScanner.js';
import { VisualforceScanner }     from './scanners/VisualforceScanner.js';
import { ApprovalProcessScanner } from './scanners/ApprovalProcessScanner.js';
import { ListViewScanner }        from './scanners/ListViewScanner.js';
import { EmailTemplateScanner }   from './scanners/EmailTemplateScanner.js';
import { PathAssistantScanner }   from './scanners/PathAssistantScanner.js';
import { ReportScanner }          from './scanners/ReportScanner.js';

const _isInFrame     = window !== window.top;
const _isSetupDomain = location.hostname.endsWith('salesforce-setup.com');

const SCANNERS = [
  new ValidationRuleScanner(),
  new FormulaFieldScanner(),
  new FlowScanner(),
  new ApexClassScanner(),
  new ApexTriggerScanner(),
  new WorkflowRuleScanner(),
  new AuraComponentScanner(),
  new VisualforceScanner(),
  new ApprovalProcessScanner(),
  new ListViewScanner(),
  new EmailTemplateScanner(),
  new PathAssistantScanner(),
  new ReportScanner(),
];

// ── URL parsing (main frame only) ──────────────────────────────────────────

function parsePageContext() {
  const m = location.pathname.match(
    /\/lightning\/setup\/ObjectManager\/([^/]+)\/FieldsAndRelationships\/([^/]+)\/view/
  );
  return m ? { objName: m[1], fieldName: m[2] } : null;
}

// ── Fetch picklist values from SF REST API ─────────────────────────────────

async function fetchPicklistValues(objName, fieldName) {
  const describe = await sfFetch(`/services/data/v59.0/sobjects/${objName}/describe/`);
  const candidates = [fieldName, fieldName + '__c', fieldName.replace(/__c$/i, '')];
  let field = null;
  for (const name of candidates) {
    field = (describe.fields || []).find(f => f.name.toLowerCase() === name.toLowerCase());
    if (field) break;
  }
  if (!field || !['picklist', 'multipicklist'].includes(field.type)) return null;
  return { fieldLabel: field.label, values: field.picklistValues || [] };
}

// ── Slide-in results panel ─────────────────────────────────────────────────

let _panel = null;

function ensurePanel() {
  if (_panel && document.body.contains(_panel)) return _panel;
  const panel = document.createElement('div');
  panel.id = 'pic-panel';
  panel.innerHTML = `
    <div id="pic-panel-header">
      <div>
        <div id="pic-panel-title">Picklist Impact Checker</div>
        <div id="pic-panel-subtitle"></div>
      </div>
      <button id="pic-panel-close" title="Close">✕</button>
    </div>
    <div id="pic-panel-body">
      <div id="pic-progress-wrap">
        <div id="pic-progress-bar-track"><div id="pic-progress-bar"></div></div>
        <div id="pic-progress-label">Starting scan…</div>
      </div>
      <div id="pic-results-wrap" style="display:none">
        <div id="pic-results-summary"></div>
        <div id="pic-results-list"></div>
      </div>
    </div>
  `;
  panel.querySelector('#pic-panel-close').addEventListener('click', closePanel);
  document.body.appendChild(panel);
  _panel = panel;
  return panel;
}

function closePanel() { if (_panel) _panel.classList.remove('pic-open'); }

function showPanel(subtitle) {
  const panel = ensurePanel();
  panel.querySelector('#pic-panel-subtitle').textContent = subtitle;
  panel.querySelector('#pic-progress-wrap').style.display = '';
  panel.querySelector('#pic-results-wrap').style.display = 'none';
  panel.querySelector('#pic-results-list').innerHTML = '';
  panel.offsetWidth;
  panel.classList.add('pic-open');
}

function setProgress(pct, label) {
  if (!_panel) return;
  _panel.querySelector('#pic-progress-bar').style.width = `${pct}%`;
  _panel.querySelector('#pic-progress-label').textContent = label;
}

function renderResults(allResults, objName, value) {
  if (!_panel) return;
  _panel.querySelector('#pic-progress-wrap').style.display = 'none';
  _panel.querySelector('#pic-results-wrap').style.display = '';

  const totalHits = Object.values(allResults).reduce((s, arr) => s + arr.filter(r => r.linkType !== null).length, 0);
  _panel.querySelector('#pic-results-summary').textContent =
    totalHits === 0 ? `No references found for "${value}"` : `${totalHits} reference${totalHits !== 1 ? 's' : ''} found for "${value}"`;

  const list = _panel.querySelector('#pic-results-list');
  list.innerHTML = '';

  if (totalHits === 0) {
    const e = document.createElement('div'); e.className = 'pic-empty-state'; e.textContent = 'Clean! No hardcoded references detected.'; list.appendChild(e); return;
  }

  for (const [typeName, items] of Object.entries(allResults)) {
    if (items.length === 0) continue;
    const group = document.createElement('div'); group.className = 'pic-result-group';
    const header = document.createElement('div'); header.className = 'pic-result-group-header';
    header.innerHTML = `<span class="pic-result-type-label">${escapeHtml(typeName)}</span><span class="pic-result-count-badge">${items.length}</span>`;
    const body = document.createElement('div'); body.className = 'pic-result-group-body';
    header.addEventListener('click', () => { body.style.display = body.style.display === 'none' ? '' : 'none'; });
    for (const item of items) {
      const div = document.createElement('div'); div.className = 'pic-result-item';
      const url = item.linkType ? buildSetupUrl(item.linkType, item.id, objName) : null;
      const nameHtml = url ? `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(item.name)}</a>` : `<span class="pic-result-error">${escapeHtml(item.name)}</span>`;
      let html = `<div class="pic-result-item-name">${nameHtml}</div>`;
      for (const snippet of item.snippets) html += `<div class="pic-result-snippet">${escapeHtml(snippet)}</div>`;
      div.innerHTML = html; body.appendChild(div);
    }
    group.appendChild(header); group.appendChild(body); list.appendChild(group);
  }
}

// ── Run scan ───────────────────────────────────────────────────────────────

async function runScanForValue(objName, value) {
  showPanel(`Scanning "${value}" on ${objName}`);
  setProgress(0, 'Starting scan…');

  let completed = 0;
  const entries = await Promise.all(
    SCANNERS.map(async scanner => {
      try {
        const result = await scanner.scan(objName, value);
        setProgress(Math.round((++completed / SCANNERS.length) * 95), `Scanned ${scanner.label}…`);
        return [scanner.label, result];
      } catch (err) {
        setProgress(Math.round((++completed / SCANNERS.length) * 95), `Error in ${scanner.label}`);
        return [scanner.label, [{ id: '', name: `⚠ Error: ${err.message}`, snippets: [], linkType: null }]];
      }
    })
  );
  const allResults = Object.fromEntries(entries);

  setProgress(100, 'Scan complete.');
  await new Promise(r => setTimeout(r, 400));
  renderResults(allResults, objName, value);
}

// ── Floating value picker (main frame only) ────────────────────────────────

let _picker = null;

function removePicker() { if (_picker) { _picker.remove(); _picker = null; } }

async function injectValuePicker(ctx) {
  if (_picker && document.body.contains(_picker)) return;
  removePicker();

  const picker = document.createElement('div');
  picker.id = 'pic-picker';
  picker.innerHTML = `
    <div id="pic-picker-header">
      <div id="pic-picker-title">Picklist Impact Checker</div>
      <div id="pic-picker-field">${escapeHtml(ctx.objName)} · ${escapeHtml(ctx.fieldName)}</div>
    </div>
    <div id="pic-picker-body"><div class="pic-picker-loading">Loading values…</div></div>
  `;
  document.body.appendChild(picker);
  _picker = picker;

  const body = picker.querySelector('#pic-picker-body');
  try {
    await getSession();
    const result = await fetchPicklistValues(ctx.objName, ctx.fieldName);
    if (!result) { body.innerHTML = '<div class="pic-picker-msg">Field not found or not a picklist.</div>'; return; }
    picker.querySelector('#pic-picker-field').textContent = `${ctx.objName} · ${result.fieldLabel}`;
    if (result.values.length === 0) { body.innerHTML = '<div class="pic-picker-msg">No picklist values found.</div>'; return; }
    body.innerHTML = '';
    for (const v of result.values) {
      const row = document.createElement('div'); row.className = 'pic-picker-row';
      const label = document.createElement('span'); label.className = 'pic-picker-label'; label.title = v.value; label.textContent = v.label || v.value;
      if (!v.active) { const tag = document.createElement('span'); tag.className = 'pic-picker-inactive'; tag.textContent = ' (inactive)'; label.appendChild(tag); }
      const btn = document.createElement('button'); btn.className = 'pic-scan-btn'; btn.textContent = 'Scan';
      btn.addEventListener('click', () => runScanForValue(ctx.objName, v.value));
      row.appendChild(label); row.appendChild(btn); body.appendChild(row);
    }
  } catch (err) {
    body.innerHTML = `<div class="pic-picker-msg pic-picker-error">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// ── Classic frame table injection (iframe only) ────────────────────────────

let _classicInjected = false;

async function injectIntoClassicTable(ctx) {
  if (_classicInjected) return;
  const { objName } = ctx;

  // Use session forwarded by the main frame (avoids hostname derivation problems
  // when running inside a same-domain salesforce-setup.com iframe).
  if (ctx.sid && ctx.instanceUrl) {
    setSession({ sid: ctx.sid, instanceUrl: ctx.instanceUrl });
  }

  const tables = document.querySelectorAll('table');
  let totalInjected = 0;

  for (const table of tables) {
    // Find the header row and map column names → indices
    const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
    if (!headerRow) continue;

    const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
    const headers = headerCells.map(c => c.textContent.trim().toLowerCase().replace(/\s+/g, ' '));

    // Only target the picklist values table — must have both "values" and "api name" columns
    const valuesIdx  = headers.findIndex(h => /^values?$/.test(h));
    const apiNameIdx = headers.findIndex(h => /api[\s\-]?name/.test(h));
    if (valuesIdx === -1 || apiNameIdx === -1) continue;

    // Add "Impact" header column if missing
    if (!headerRow.querySelector('.pic-th')) {
      const tag = headerCells[0]?.tagName.toLowerCase() || 'td';
      const th = document.createElement(tag);
      th.className = 'pic-th';
      th.textContent = 'Impact';
      headerRow.appendChild(th);
    }

    // Inject Scan buttons into data rows
    const dataRows = Array.from(table.querySelectorAll('tbody tr, tr')).filter(row => {
      if (row.parentElement?.tagName === 'THEAD') return false;
      if (row.querySelector('th') && !row.querySelector('td')) return false;
      return true;
    });

    for (const row of dataRows) {
      if (row.querySelector('.pic-scan-btn')) continue;
      const cells = Array.from(row.querySelectorAll('th, td'));
      if (cells.length <= apiNameIdx) continue;
      const apiValue = cells[apiNameIdx].textContent.trim();
      if (!apiValue) continue;

      const td = document.createElement('td');
      const a = document.createElement('a');
      a.className = 'pic-scan-link';
      a.textContent = 'Scan';
      a.href = '#';
      a.addEventListener('click', (e) => { e.preventDefault(); runScanForValue(objName, apiValue); });
      td.appendChild(a);
      row.appendChild(td);
      totalInjected++;
    }
  }

  if (totalInjected > 0) {
    _classicInjected = true;
  } else {
    _classicInjected = false; // allow retry on next PIC_CONTEXT
  }
}

// ── Main frame init ────────────────────────────────────────────────────────

function initSetupFrame() {
  // Build context message with session baked in so the iframe doesn't need
  // to derive instanceUrl from its own (VF) hostname.
  async function buildCtxMsg() {
    const ctx = parsePageContext();
    if (!ctx) return null;
    const msg = { type: 'PIC_CONTEXT', ...ctx };
    try {
      const session = await getSession();
      msg.sid = session.sid;
      msg.instanceUrl = session.instanceUrl;
    } catch { /* send without session — iframe will fall back to getSession() */ }
    return msg;
  }

  // When a child frame announces PIC_READY, send it the current context + session
  window.addEventListener('message', async (e) => {
    if (e.data?.type !== 'PIC_READY') return;
    const msg = await buildCtxMsg();
    if (!msg) return;
    try { e.source.postMessage(msg, '*'); } catch { }
  });

  async function broadcastContext() {
    const msg = await buildCtxMsg();
    if (!msg) return;
    for (let i = 0; i < window.frames.length; i++) {
      try { window.frames[i].postMessage(msg, '*'); } catch { }
    }
  }

  let _lastUrl = location.href;
  let _debounceTimer = null;

  new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      closePanel();
    }
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(tryPage, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });

  function tryPage() {
    const ctx = parsePageContext();
    if (!ctx) return;
    // Buttons are injected inline in the iframe table — just broadcast context
    broadcastContext();
  }

  setTimeout(tryPage, 600);
  // Broadcast again to catch late-loading iframes
  setTimeout(broadcastContext, 2000);
  setTimeout(broadcastContext, 4000);

}

// ── Iframe init ────────────────────────────────────────────────────────────

function initClassicFrame() {
  window.addEventListener('message', async (e) => {
    if (e.data?.type !== 'PIC_CONTEXT') return;
    await injectIntoClassicTable(e.data);
  });

  // Announce readiness to parent frame (retry several times to handle timing)
  function announceReady() {
    try { window.parent.postMessage({ type: 'PIC_READY' }, '*'); } catch { }
  }
  announceReady();
  setTimeout(announceReady, 300);
  setTimeout(announceReady, 800);
  setTimeout(announceReady, 2000);
}

// ── Entrypoint ─────────────────────────────────────────────────────────────

if (_isSetupDomain && !_isInFrame) {
  initSetupFrame();
} else if (_isInFrame) {
  initClassicFrame();
}
// else: salesforce.com main window (not iframe) — do nothing
