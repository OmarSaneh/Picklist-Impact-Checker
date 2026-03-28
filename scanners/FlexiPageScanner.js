import { toolingQuery, toolingQueryAll } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class FlexiPageScanner extends MetadataScanner {
  get label() { return 'Lightning Pages'; }

  // Recursively walk the Metadata object tree looking for componentInstanceProperty
  // entries whose value matches the picklist value
  #findSnippets(obj, value, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 10) return [];
    const hits = [];
    if (Array.isArray(obj)) {
      for (const item of obj) {
        hits.push(...this.#findSnippets(item, value, depth + 1));
        if (hits.length >= 3) break;
      }
    } else {
      // A component property object looks like { name: 'propName', value: 'theValue' }
      if (obj.value === value && typeof obj.name === 'string') {
        hits.push(`${obj.name}: ${value}`);
      }
      for (const v of Object.values(obj)) {
        if (hits.length >= 3) break;
        hits.push(...this.#findSnippets(v, value, depth + 1));
      }
    }
    return hits;
  }

  async scan(_objName, value) {
    // List Id + MasterLabel only — bulk Metadata field is truncated for large pages
    let list;
    try {
      list = await toolingQueryAll(`SELECT Id, MasterLabel FROM FlexiPage`);
    } catch { return []; }

    const jq = '"' + value + '"';
    const BATCH = 10;
    const results = [];

    for (let i = 0; i < list.length; i += BATCH) {
      const batch = await Promise.all(list.slice(i, i + BATCH).map(async r => {
        try {
          const detail = await toolingQuery(`SELECT Id, MasterLabel, Metadata FROM FlexiPage WHERE Id = '${r.Id}'`);
          if (!detail.length) return null;
          const meta = detail[0].Metadata;
          if (!meta || !JSON.stringify(meta).includes(jq)) return null;
          const snippets = this.#findSnippets(meta, value).slice(0, 3);
          return {
            id: r.Id,
            name: r.MasterLabel,
            snippets: snippets.length ? snippets : [`Contains "${value}" in component configuration`],
            linkType: 'FlexiPage',
          };
        } catch { return null; }
      }));
      results.push(...batch.filter(Boolean));
    }
    return results;
  }
}
