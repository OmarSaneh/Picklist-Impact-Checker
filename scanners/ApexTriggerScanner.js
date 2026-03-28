import { toolingQuery, toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ApexTriggerScanner extends MetadataScanner {
  get label() { return 'Apex Triggers'; }

  async scan(_objName, value) {
    // Scan ALL triggers (Active and Inactive) — inactive triggers can be re-enabled
    // List Id+Name+Status only — bulk SOQL truncates Body on large triggers
    let list;
    try { list = await toolingQueryAll(`SELECT Id, Name, Status FROM ApexTrigger`); } catch { return []; }

    const q = "'" + value + "'";
    const BATCH = 10;
    const results = [];

    for (let i = 0; i < list.length; i += BATCH) {
      const batch = await Promise.all(list.slice(i, i + BATCH).map(async r => {
        try {
          const detail = await toolingQuery(`SELECT Id, Name, Body FROM ApexTrigger WHERE Id = '${r.Id}'`);
          if (!detail.length) return null;
          const body = detail[0].Body || '';
          if (!body.includes(q)) return null;
          const name = r.Status === 'Active' ? r.Name : `${r.Name} (${r.Status})`;
          return { id: r.Id, name, snippets: getMatchingSnippets(body, q), linkType: 'ApexTrigger' };
        } catch { return null; }
      }));
      results.push(...batch.filter(Boolean));
    }
    return results;
  }
}
