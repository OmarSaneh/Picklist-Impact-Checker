# Picklist Impact Checker — AI Context

Chrome extension that scans a Salesforce org for hardcoded references to a picklist value across
13 metadata types. Users navigate to a picklist field in Setup, click "Scan" next to a value,
and the extension queries the org's APIs in parallel and presents all references in a slide-in panel.

## Build

```bash
npm run build          # bundles content.js → content.bundle.js via esbuild
```

After building, reload the extension in `chrome://extensions` (use the reload ↺ button).
If you changed `background.js`, you must reload the extension — a page refresh is not enough.

## File Map

```
background.js          # MV3 service worker: GET_SESSION, SOAP_METADATA, GET_FRAMES
content.js             # Content script: picker UI, results panel, parallel scan runner
api.js                 # sfFetch, toolingQuery/All, restQuery/All
utils.js               # escapeHtml, getMatchingSnippets, buildSetupUrl
scanners/
  MetadataScanner.js   # Base class (label + scan())
  *.js                 # 13 concrete scanners
```

## Adding a New Scanner

1. Create `scanners/MyScanner.js` extending `MetadataScanner`
2. Implement `get label()` and `async scan(objName, value)`
3. Return `Array<{ id, name, snippets, linkType }>` — empty array if nothing found
4. Add a `case 'MyType':` to `buildSetupUrl()` in `utils.js`
5. Import and add `new MyScanner()` to `SCANNERS` in `content.js`
6. `npm run build`

```js
// Minimal scanner template
import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class MyScanner extends MetadataScanner {
  get label() { return 'My Type'; }

  async scan(objName, value) {
    let records;
    try { records = await toolingQuery(`SELECT Id, Name, Body FROM MyType`); } catch { return []; }
    const q = "'" + value + "'";   // single-quote for Apex/formula syntax
    return records
      .filter(r => (r.Body || '').includes(q))
      .map(r => ({ id: r.Id, name: r.Name, snippets: getMatchingSnippets(r.Body, q), linkType: 'MyType' }));
  }
}
```

## Quote Style by Context

| Context | Quote | Example |
|---|---|---|
| Apex / formula / SOQL criteria | `'value'` | `"'" + value + "'"` |
| Flow / JSON metadata | `"value"` | `'"' + value + '"'` |
| XML (Approval Process via SOAP) | `<value>value</value>` | direct XML search |
| List view / report filters | exact equality | `filter.value === value` (or split by comma) |

## API Reference

| Function | Endpoint | Use for |
|---|---|---|
| `toolingQuery(soql)` | `/tooling/query` | Single-page Tooling API queries |
| `toolingQueryAll(soql)` | `/tooling/query` + pagination | Large Tooling API result sets |
| `restQuery(soql)` | `/query` | Standard REST SOQL (single page) |
| `restQueryAll(soql)` | `/query` + pagination | Standard REST SOQL (all pages) |
| `sfFetch(path)` | any path | Raw REST call (Analytics API, list views, etc.) |

## Known Tooling API Quirks

- **`ApprovalProcess`** is not a Tooling API SOQL object. Use the SOAP Metadata API instead
  (see `ApprovalProcessScanner.js`). The SOAP call must go through `background.js` to bypass CORS.
- **`WorkflowRule` / `CustomField`** — `TableEnumOrId = 'Case'` fails for standard objects.
  Resolve the entity ID first: `SELECT Id FROM EntityDefinition WHERE QualifiedApiName = '${objName}'`,
  then use that ID in the filter.
- **`Metadata` field in bulk queries** — some Tooling API objects (ValidationRule, WorkflowRule,
  ApprovalProcess) only return the `Metadata` compound field when queried by ID one record at a time,
  not in bulk SOQL. Follow the two-step pattern in `ValidationRuleScanner.js`.
- **`EntityDefinition.QualifiedApiName`** relationship traversal works in `ValidationRule` WHERE
  clauses but not in `WorkflowRule` or `CustomField`.

## CORS Notes

All `sfFetch` calls (REST API) work fine from the content script — Salesforce REST endpoints
include CORS headers. The **SOAP Metadata API** (`/services/Soap/m/59.0`) does NOT have CORS
headers, so it must be called from the background service worker:

```js
const result = await chrome.runtime.sendMessage({ type: 'SOAP_METADATA', instanceUrl, body: envelope });
```

## Result Object Shape

```js
{
  id: string,        // Salesforce record ID (used to build the Setup URL); '' if not applicable
  name: string,      // Display name shown as a link in the panel
  snippets: string[], // Lines of context (empty array = name-only display)
  linkType: string | null,  // Key for buildSetupUrl(); null = renders as error (no link)
}
```

**Important:** items with `linkType: null` are counted as 0 hits. If ALL scanners return only
null-linkType items, the panel shows "Clean!" and hides everything. Use a real `linkType` for
error messages that should be visible to the user.

## Scanners Overview

| Scanner | API Used | Object Filter |
|---|---|---|
| ValidationRule | Tooling SOQL | `EntityDefinition.QualifiedApiName` |
| FormulaField | Tooling SOQL | `EntityDefinitionId` (resolved from EntityDefinition) |
| Flow | Tooling SOQL | None (Active only, fully paginated) |
| ApexClass | Tooling SOQL | None (all classes) |
| ApexTrigger | Tooling SOQL | None (Active only) |
| WorkflowRule | Tooling SOQL | `TableEnumOrId` with entity ID |
| AuraComponent | Tooling SOQL | None; results grouped by bundle (fully paginated) |
| VisualforcePage | Tooling SOQL | None |
| ApprovalProcess | SOAP Metadata API | `fullName` prefix `${objName}.` |
| ListView | Standard REST | Scoped to `objName` by URL path |
| EmailTemplate | Standard REST SOQL | None |
| PathAssistant | Tooling SOQL | None |
| Report | Analytics REST | None (fully paginated via nextPageUrl) |

---

## Known Improvements / Technical Debt

### Body/Source/Markup truncation in Tooling API SOQL
The following scanners query large text fields via bulk SOQL, which may return truncated content
for very large files. The safe pattern is a two-step fetch: list by ID first, then fetch each
record individually via `/tooling/sobjects/{Type}/{Id}` (the same pattern used by ValidationRule
and WorkflowRule scanners):

| Scanner | Field at risk |
|---|---|
| `ApexClassScanner` | `Body` on `ApexClass` |
| `ApexTriggerScanner` | `Body` on `ApexTrigger` |
| `AuraComponentScanner` | `Source` on `AuraDefinition` |
| `LwcScanner` | `Source` on `LightningComponentResource` |
| `VisualforceScanner` | `Markup` on `ApexPage` / `ApexComponent` |
