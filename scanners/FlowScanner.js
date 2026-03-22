import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

const NODE_TYPES = ['decisions','assignments','recordLookups','recordCreates','recordUpdates','recordDeletes','loops','screens','actionCalls','subflows','waits','customErrors'];

export class FlowScanner extends MetadataScanner {
  get label() { return 'Flows'; }
  get progressPct() { return 38; }

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
    try { flowList = await toolingQuery(`SELECT Id, MasterLabel FROM Flow WHERE Status = 'Active' LIMIT 50`); }
    catch { return []; }
    const results = [];
    const jq = '"' + value + '"';
    for (const flow of flowList) {
      try {
        const detail = await toolingQuery(`SELECT Id, MasterLabel, Metadata FROM Flow WHERE Id = '${flow.Id}'`);
        if (!detail.length) continue;
        const snippets = this.#extractSnippets(detail[0].Metadata || {}, jq);
        if (snippets.length > 0) results.push({ id: flow.Id, name: flow.MasterLabel, snippets, linkType: 'Flow' });
      } catch { /* skip */ }
    }
    return results;
  }
}
