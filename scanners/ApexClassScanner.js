import { toolingQuery, toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ApexClassScanner extends MetadataScanner {
  get label() { return 'Apex Classes'; }

  async scan(_objName, value) {
    // List Id+Name only — bulk SOQL truncates Body on large classes
    let list;
    try { list = await toolingQueryAll(`SELECT Id, Name FROM ApexClass`); } catch { return []; }

    const q = "'" + value + "'";
    const BATCH = 10;
    const results = [];

    for (let i = 0; i < list.length; i += BATCH) {
      const batch = await Promise.all(list.slice(i, i + BATCH).map(async r => {
        try {
          const detail = await toolingQuery(`SELECT Id, Name, Body FROM ApexClass WHERE Id = '${r.Id}'`);
          if (!detail.length) return null;
          const body = detail[0].Body || '';
          if (!body.includes(q)) return null;
          return { id: r.Id, name: r.Name, snippets: getMatchingSnippets(body, q), linkType: 'ApexClass' };
        } catch { return null; }
      }));
      results.push(...batch.filter(Boolean));
    }
    return results;
  }
}
