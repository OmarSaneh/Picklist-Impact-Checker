# Picklist Impact Checker

A Salesforce Chrome extension that scans your org's metadata for hardcoded picklist values helping you to know exactly what could break before you rename or deactivate one.

---

## What it does

When you're on a picklist field in Salesforce Setup (Object Manager → Fields & Relationships), the extension injects a **Scan** button next to each value. Click it and a side panel shows every place that value is hardcoded across 22 metadata types.

---

## Scanners (22 total)

| # | Metadata Type | Scope | Notes |
|---|---|---|---|
| 1 | **Validation Rules** | All objects | Checks formula body for the quoted value |
| 2 | **Formula Fields** | All objects | Checks formula expression |
| 3 | **Flows** | All objects | Checks all flow element values and conditions |
| 4 | **Apex Classes** | Org-wide | Full-text search of class body |
| 5 | **Apex Triggers** | All objects | Full-text search of trigger body |
| 6 | **Workflow Rules** | All objects | Checks rule criteria and field update values |
| 7 | **Aura Components** | Org-wide | Checks component, controller, and helper files |
| 8 | **Visualforce Pages** | Org-wide | Checks page markup for EL expressions |
| 9 | **Approval Processes** | All objects | Checks entry criteria and step conditions via SOAP Metadata API |
| 10 | **List Views** | All objects | Checks SOQL filter query for the value |
| 11 | **Email Templates** | Org-wide | Checks HTML and plain-text body |
| 12 | **Path Assistants** ⏳ | All objects | Checks step picklist value entries — pending validation |
| 13 | **Reports** | Org-wide | Checks report filter values (supports multi-value filters) |
| 14 | **Record Types** | All objects | Checks which picklist values are enabled per record type |
| 15 | **Support Processes** | Case only | Checks which Status values are active in each support process |
| 16 | **Escalation Rules** | Case only | Checks rule entry criteria for the value |
| 17 | **Entitlement Processes** | Case & WorkOrder | Checks milestone criteria conditions |
| 18 | **LWC** | Org-wide | Full-text search of component JS files |
| 19 | **Assignment Rules** | Case & Lead | Checks rule criteria values |
| 20 | **Sharing Rules** | All objects | Checks criteria-based sharing rule conditions |
| 21 | **Quick Actions** | All objects | Checks field overrides with literal picklist values on object-scoped actions |
| 22 | **Sales & Lead Processes** ⏳ | Opportunity & Lead | Checks which Stage/Status values are active in each process — pending validation |

---

## Installation

1. Clone this repo
2. Run `npm install` then `npm run build`
3. Open Chrome → `chrome://extensions` → Enable **Developer mode**
4. Click **Load unpacked** and select this folder
5. Navigate to any picklist field in Salesforce Setup — the extension activates automatically

---

## How to use

1. Go to **Setup → Object Manager → [Object] → Fields & Relationships → [Picklist Field]**
2. A floating **Picklist Impact Checker** widget appears with all values listed
3. Click **Scan** next to any value
4. The results panel slides in showing every metadata reference, grouped by type

---

## Org verification

When you have multiple Salesforce orgs open (e.g. Production + a Sandbox), there is a risk that the extension authenticates against the wrong org. To prevent silent mis-scans, the panel header always shows **which org and user the session belongs to**:

| Indicator | Meaning |
|---|---|
| 🟢 `john.doe@acme.com.sandbox` | Session matched the exact domain of the current tab — you are scanning the right org |
| 🔴 `john.doe@acme.com.sandbox` + **Please refresh your screen** | A fallback cookie was used because the exact-domain match failed — the session may belong to a different org. Refresh the Salesforce tab to re-establish a clean session |

The username is fetched via the OAuth `/userinfo` endpoint immediately after each scan starts, so the badge reflects the live authenticated identity rather than any cached assumption. If the badge shows a red dot, do not trust the scan results until you have refreshed and confirmed a green dot.

---

## Tech stack

- **Manifest V3** Chrome Extension
- Vanilla ES Modules (no framework)
- **esbuild** for bundling
- Salesforce REST API, Tooling API, Analytics API, SOAP Metadata API
