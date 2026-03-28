import { toolingQuery, toolingQueryAll } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

const NODE_TYPES = ['decisions','assignments','recordLookups','recordCreates','recordUpdates','recordDeletes','loops','screens','actionCalls','subflows','waits','customErrors'];

export class FlowScanner extends MetadataScanner {
  get label() { return 'Flows'; }

  #extractSnippets(meta, jq) {
    const hits = [];
    for (const nodeType of NODE_TYPES) {
      const nodes = meta[nodeType];
      if (!Array.isArray(nodes)) continue;
      for (const node of nodes) {
        if (JSON.stringify(node).includes(jq)) {
          hits.push(`${nodeType}: "${node.label || node.name || nodeType}"`);
          if (hits.length >= 3) return hits;
        }
      }
    }
    if (hits.length === 0 && JSON.stringify(meta).includes(jq)) hits.push('Found in flow metadata (open Flow Builder for details)');
    return hits;
  }

  async scan(_objName, value) {
    let flowList;
    // Scan ALL flows (Active, Inactive, Draft) — inactive flows are a common source of hidden references
    try { flowList = await toolingQueryAll(`SELECT Id, MasterLabel, Status FROM Flow`); }
    catch { return []; }

    const jq = '"' + value + '"';
    const BATCH = 10;
    const results = [];

    for (let i = 0; i < flowList.length; i += BATCH) {
      const batch = await Promise.all(flowList.slice(i, i + BATCH).map(async flow => {
        try {
          const detail = await toolingQuery(`SELECT Id, MasterLabel, Status, Metadata FROM Flow WHERE Id = '${flow.Id}'`);
          if (!detail.length) return null;
          const snippets = this.#extractSnippets(detail[0].Metadata || {}, jq);
          if (snippets.length === 0) return null;
          const name = flow.Status === 'Active' ? flow.MasterLabel : `${flow.MasterLabel} (${flow.Status})`;
          return { id: flow.Id, name, snippets, linkType: 'Flow' };
        } catch { return null; }
      }));
      results.push(...batch.filter(Boolean));
    }
    return results;
  }
}
