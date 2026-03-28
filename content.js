/* ─────────────────────────────────────────────────────────────────────────
   Picklist Impact Checker — content.js
   Runs in two contexts:
   1. Main frame on salesforce-setup.com  → floating picker + context relay
   2. Child iframe on salesforce.com       → table row injection + panel
   ───────────────────────────────────────────────────────────────────────── */

import { getSession, getSessionCached, setSession, sfFetch, getOrgName } from './api.js';
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
import { RecordTypeScanner }      from './scanners/RecordTypeScanner.js';
import { SupportProcessScanner }  from './scanners/SupportProcessScanner.js';
import { EscalationRuleScanner }  from './scanners/EscalationRuleScanner.js';
import { EntitlementProcessScanner } from './scanners/EntitlementProcessScanner.js';
import { LwcScanner }                from './scanners/LwcScanner.js';
import { AssignmentRuleScanner }     from './scanners/AssignmentRuleScanner.js';
import { SharingRuleScanner }        from './scanners/SharingRuleScanner.js';
import { QuickActionScanner }        from './scanners/QuickActionScanner.js';
import { SalesProcessScanner }       from './scanners/SalesProcessScanner.js';
import { CustomMetadataScanner }     from './scanners/CustomMetadataScanner.js';
import { FlexiPageScanner }          from './scanners/FlexiPageScanner.js';
import { OmnistudioScanner }         from './scanners/OmnistudioScanner.js';

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
  new RecordTypeScanner(),
  new SupportProcessScanner(),
  new EscalationRuleScanner(),
  new EntitlementProcessScanner(),
  new LwcScanner(),
  new AssignmentRuleScanner(),
  new SharingRuleScanner(),
  new QuickActionScanner(),
  new SalesProcessScanner(),
  new CustomMetadataScanner(),
  new FlexiPageScanner(),
  new OmnistudioScanner(),
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
      <div id="pic-panel-header-row">
        <div id="pic-panel-title-wrap">
          <span id="pic-panel-title">Picklist Impact Checker</span>
          <button id="pic-panel-info-btn" title="About" tabindex="-1">i</button>
        </div>
        <div id="pic-panel-actions">
          <button class="pic-header-btn" id="pic-panel-settings" title="Settings">⚙</button>
          <button class="pic-header-btn" id="pic-panel-close" title="Close">✕</button>
        </div>
      </div>
      <div id="pic-panel-org-badge">
        <span id="pic-panel-org">—</span>
        <span id="pic-signal-dot" class="pic-signal-dot"></span>
      </div>
      <div id="pic-panel-session-warn" style="display:none">Please refresh your screen</div>
      <div id="pic-panel-subtitle"></div>
    </div>
    <div id="pic-about-popover" style="display:none">
      <div id="pic-about-title">Picklist Impact Checker <span id="pic-about-version">v1.0.0</span></div>
      <div id="pic-about-desc">Scans 22 Salesforce metadata types for hardcoded picklist values.</div>
      <div id="pic-about-links">
        <a href="https://github.com/OmarSaneh/Picklist-Impact-Checker/issues/new?labels=bug&template=bug_report.md" target="_blank" class="pic-about-link">🐛 Report a bug</a>
        <a href="https://github.com/OmarSaneh/Picklist-Impact-Checker/issues/new?labels=enhancement&template=feature_request.md" target="_blank" class="pic-about-link">💡 Request a feature</a>
      </div>
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
      <div id="pic-settings-wrap" style="display:none">
        <div id="pic-settings-list"></div>
        <div id="pic-settings-footer">
          <button class="pic-settings-btn pic-settings-btn--save" id="pic-settings-save-btn">Save</button>
          <button class="pic-settings-btn pic-settings-btn--cancel" id="pic-settings-cancel-btn">Cancel</button>
        </div>
      </div>
    </div>
  `;
  panel.querySelector('#pic-panel-close').addEventListener('click', closePanel);
  panel.querySelector('#pic-panel-settings').addEventListener('click', openSettings);
  const infoBtn = panel.querySelector('#pic-panel-info-btn');
  const aboutPopover = panel.querySelector('#pic-about-popover');
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (aboutPopover.style.display === 'none') {
      const header = panel.querySelector('#pic-panel-header');
      aboutPopover.style.top = (header.offsetTop + header.offsetHeight + 6) + 'px';
      aboutPopover.style.display = 'block';
    } else {
      aboutPopover.style.display = 'none';
    }
  });
  document.addEventListener('click', (e) => {
    if (!aboutPopover.contains(e.target) && e.target !== infoBtn) {
      aboutPopover.style.display = 'none';
    }
  });
  panel.querySelector('#pic-settings-save-btn').addEventListener('click', saveSettings);
  panel.querySelector('#pic-settings-cancel-btn').addEventListener('click', closeSettings);
  document.body.appendChild(panel);
  _panel = panel;
  return panel;
}

function closePanel() { if (_panel) _panel.classList.remove('pic-open'); }

function setOrgBadgeState(name, isFallback) {
  if (!_panel) return;
  if (name) _panel.querySelector('#pic-panel-org').textContent = name;
  const dot = _panel.querySelector('#pic-signal-dot');
  const warn = _panel.querySelector('#pic-panel-session-warn');
  if (isFallback) {
    dot.classList.add('pic-signal-dot--warn');
    warn.style.display = '';
  } else {
    dot.classList.remove('pic-signal-dot--warn');
    warn.style.display = 'none';
  }
}

// ── Settings storage ──────────────────────────────────────────────────────

function loadDisabledScanners() {
  return new Promise(resolve => {
    chrome.storage.local.get('pic_disabled_scanners', data => {
      resolve(new Set(data.pic_disabled_scanners || []));
    });
  });
}

function saveDisabledScanners(disabled) {
  return new Promise(resolve => {
    chrome.storage.local.set({ pic_disabled_scanners: [...disabled] }, resolve);
  });
}

let _settingsRestoreState = null;

async function openSettings() {
  if (!_panel) return;
  _settingsRestoreState = {
    progress: _panel.querySelector('#pic-progress-wrap').style.display,
    results:  _panel.querySelector('#pic-results-wrap').style.display,
  };
  const disabled = await loadDisabledScanners();
  const list = _panel.querySelector('#pic-settings-list');
  list.innerHTML = SCANNERS.map(s => {
    const on = !disabled.has(s.label);
    return `<div class="pic-settings-row${on ? ' pic-settings-row--on' : ''}">
      <span class="pic-settings-label">${escapeHtml(s.label.toUpperCase())}</span>
      <label class="pic-toggle">
        <input type="checkbox" data-label="${escapeHtml(s.label)}"${on ? ' checked' : ''}>
        <span class="pic-toggle-slider"></span>
      </label>
    </div>`;
  }).join('');
  list.querySelectorAll('.pic-toggle input').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.pic-settings-row').classList.toggle('pic-settings-row--on', cb.checked);
    });
  });
  _panel.querySelector('#pic-progress-wrap').style.display = 'none';
  _panel.querySelector('#pic-results-wrap').style.display = 'none';
  _panel.querySelector('#pic-settings-wrap').style.display = 'flex';
}

function closeSettings() {
  if (!_panel) return;
  _panel.querySelector('#pic-settings-wrap').style.display = 'none';
  if (_settingsRestoreState) {
    _panel.querySelector('#pic-progress-wrap').style.display = _settingsRestoreState.progress;
    _panel.querySelector('#pic-results-wrap').style.display  = _settingsRestoreState.results;
    _settingsRestoreState = null;
  }
}

async function saveSettings() {
  if (!_panel) return;
  const disabled = new Set();
  _panel.querySelectorAll('#pic-settings-list .pic-toggle input').forEach(cb => {
    if (!cb.checked) disabled.add(cb.dataset.label);
  });
  await saveDisabledScanners(disabled);
  closeSettings();
}

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
    header.innerHTML = `<span class="pic-result-type-label"><span class="pic-collapse-arrow">▼</span>${escapeHtml(typeName)}</span><span class="pic-result-count-badge">${items.length}</span>`;
    const body = document.createElement('div'); body.className = 'pic-result-group-body';
    header.addEventListener('click', () => {
      const collapsed = body.style.display === 'none';
      body.style.display = collapsed ? '' : 'none';
      header.querySelector('.pic-collapse-arrow').textContent = collapsed ? '▼' : '▶';
    });
    for (const item of items) {
      const div = document.createElement('div'); div.className = 'pic-result-item';
      const url = (item.linkType && item.linkType !== 'plain') ? buildSetupUrl(item.linkType, item.id, objName) : null;
      const nameHtml = url ? `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(item.name)}</a>`
        : item.linkType === null ? `<span class="pic-result-error">${escapeHtml(item.name)}</span>`
        : `<span>${escapeHtml(item.name)}</span>`;
      let html = `<div class="pic-result-item-name">${nameHtml}</div>`;
      for (const snippet of item.snippets) html += `<div class="pic-result-snippet">${escapeHtml(snippet)}</div>`;
      div.innerHTML = html; body.appendChild(div);
    }
    group.appendChild(header); group.appendChild(body); list.appendChild(group);
  }
}

// ── Progressive scan rendering ────────────────────────────────────────────

const SKELETON_CONCURRENCY = 3;

function renderSkeleton(el) {
  el.className = 'pic-result-group pic-result-group--loading';
  el.innerHTML = `
    <div class="pic-result-group-header">
      <span class="pic-skeleton-title"></span>
      <span class="pic-skeleton-badge"></span>
    </div>
    <div class="pic-skeleton-body">
      <div class="pic-skeleton-line"></div>
      <div class="pic-skeleton-line pic-skeleton-line--short"></div>
    </div>`;
}

function renderResultGroup(el, label, items, objName) {
  const hits = items.filter(r => r.linkType !== null).length;
  el.className = 'pic-result-group';
  const header = document.createElement('div'); header.className = 'pic-result-group-header';
  header.innerHTML = `<span class="pic-result-type-label"><span class="pic-collapse-arrow">▼</span>${escapeHtml(label)}</span><span class="pic-result-count-badge">${hits}</span>`;
  const body = document.createElement('div'); body.className = 'pic-result-group-body';
  header.addEventListener('click', () => {
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    header.querySelector('.pic-collapse-arrow').textContent = collapsed ? '▼' : '▶';
  });
  for (const item of items) {
    const div = document.createElement('div'); div.className = 'pic-result-item';
    const url = (item.linkType && item.linkType !== 'plain') ? buildSetupUrl(item.linkType, item.id, objName) : null;
    const nameHtml = url ? `<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(item.name)}</a>`
      : item.linkType === null ? `<span class="pic-result-error">${escapeHtml(item.name)}</span>`
      : `<span>${escapeHtml(item.name)}</span>`;
    let html = `<div class="pic-result-item-name">${nameHtml}</div>`;
    for (const snippet of item.snippets) html += `<div class="pic-result-snippet">${escapeHtml(snippet)}</div>`;
    div.innerHTML = html; body.appendChild(div);
  }
  el.innerHTML = '';
  el.appendChild(header);
  el.appendChild(body);
}

// ── Run scan ──────────────────────────────────────────────────────────────

async function runScanForValue(objName, value) {
  const panel = ensurePanel();
  panel.querySelector('#pic-panel-subtitle').textContent = `Scanning "${value}" on ${objName}`;
  panel.querySelector('#pic-progress-wrap').style.display = '';
  panel.querySelector('#pic-progress-bar').style.width = '0%';
  panel.querySelector('#pic-progress-label').textContent = 'Starting scan…';
  panel.querySelector('#pic-results-wrap').style.display = '';
  panel.querySelector('#pic-results-summary').textContent = `Scanning "${value}"…`;
  panel.querySelector('#pic-results-list').innerHTML = '';
  panel.classList.remove('pic-open');
  panel.offsetWidth;
  panel.classList.add('pic-open');

  getOrgName().then(name => {
    setOrgBadgeState(name || null, getSessionCached()?.fallback === true);
  }).catch(() => {});

  const list = panel.querySelector('#pic-results-list');
  const summaryEl = panel.querySelector('#pic-results-summary');
  const progressBar = panel.querySelector('#pic-progress-bar');
  const progressLabel = panel.querySelector('#pic-progress-label');

  const disabled = await loadDisabledScanners();
  const activeScanners = SCANNERS.filter(s => !disabled.has(s.label));

  // Pool of active skeleton DOM elements, oldest first (FIFO)
  const skeletonQueue = [];
  let remaining = activeScanners.length;
  let completed = 0;
  let totalHits = 0;
  const cleanLabels = [];

  // Keep up to SKELETON_CONCURRENCY anonymous skeletons, capped by remaining count
  function replenishSkeletons() {
    while (skeletonQueue.length < Math.min(SKELETON_CONCURRENCY, remaining)) {
      const el = document.createElement('div');
      renderSkeleton(el);
      list.appendChild(el);
      skeletonQueue.push(el);
    }
  }

  replenishSkeletons();

  await Promise.all(activeScanners.map(async (scanner) => {
      let items;
      try {
        items = await scanner.scan(objName, value);
      } catch (err) {
        console.error(`[Picklist Impact Checker] ${scanner.label} scan error:`, err);
        items = [{ id: '', name: `⚠ Error: ${err.message}`, snippets: [], linkType: null }];
      }

      completed++;
      remaining--;
      const hits = items.filter(r => r.linkType !== null).length;
      totalHits += hits;

      // Claim the oldest skeleton — transform it into a result or remove it
      const slot = skeletonQueue.shift();
      if (hits > 0) {
        renderResultGroup(slot, scanner.label, items, objName);
      } else {
        cleanLabels.push(scanner.label);
        slot.remove();
      }

      // Append a fresh skeleton at the bottom if slots still needed
      replenishSkeletons();

      // Progress bar
      progressBar.style.width = `${Math.round((completed / activeScanners.length) * 100)}%`;

      if (remaining > 0) {
        progressLabel.textContent = `Scanned ${scanner.label}… (${remaining} remaining)`;
        summaryEl.textContent = totalHits > 0
          ? `${totalHits} hit${totalHits !== 1 ? 's' : ''} so far · ${remaining} more scanning…`
          : `Scanning… (${remaining} remaining)`;
      } else {
        panel.querySelector('#pic-progress-wrap').style.display = 'none';
        if (totalHits === 0) {
          const e = document.createElement('div'); e.className = 'pic-empty-state';
          e.textContent = 'Clean! No hardcoded references detected.';
          list.appendChild(e);
        }
        const summaryText = totalHits === 0
          ? `No references found for "${value}"`
          : `${totalHits} reference${totalHits !== 1 ? 's' : ''} found for "${value}"`;
        summaryEl.innerHTML = `${escapeHtml(summaryText)} <button class="pic-rescan-btn" title="Re-scan">↺</button>`;
        summaryEl.querySelector('.pic-rescan-btn').addEventListener('click', () => runScanForValue(objName, value));
      }
  }));

  // ── "Scanned clean" section ──────────────────────────────────────────────
  if (cleanLabels.length > 0) {
    const section = document.createElement('div');
    section.className = 'pic-clean-section';
    section.innerHTML = `
      <div class="pic-clean-header">Scanned — no references found (${cleanLabels.length})</div>
      <div class="pic-clean-tags">${cleanLabels.map(l => `<span class="pic-clean-tag">${escapeHtml(l)}</span>`).join('')}</div>`;
    list.appendChild(section);
  }
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
    getOrgName().then(name => { setOrgBadgeState(name || null, getSessionCached()?.fallback === true); }).catch(() => {});
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
