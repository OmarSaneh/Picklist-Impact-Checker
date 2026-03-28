import { toolingQuery, toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class VisualforceScanner extends MetadataScanner {
  get label() { return 'Visualforce Pages'; }

  async scan(_objName, value) {
    const qSingle = "'" + value + "'";
    const qDouble = '"' + value + '"';

    // List Id+Name only — bulk SOQL truncates Markup on large pages
    const [pages, components] = await Promise.all([
      toolingQueryAll(`SELECT Id, Name FROM ApexPage`).catch(() => []),
      toolingQueryAll(`SELECT Id, Name FROM ApexComponent`).catch(() => []),
    ]);

    const all = [
      ...pages.map(r => ({ ...r, type: 'ApexPage' })),
      ...components.map(r => ({ ...r, type: 'ApexComponent' })),
    ];

    // Per-record fetch for full Markup, parallelised in batches of 10
    const BATCH = 10;
    const results = [];
    for (let i = 0; i < all.length; i += BATCH) {
      const batch = await Promise.all(all.slice(i, i + BATCH).map(async r => {
        try {
          const detail = await toolingQuery(`SELECT Id, Name, Markup FROM ${r.type} WHERE Id = '${r.Id}'`);
          if (!detail.length) return null;
          const markup = detail[0].Markup || '';
          if (!markup.includes(qSingle) && !markup.includes(qDouble)) return null;
          const q = markup.includes(qSingle) ? qSingle : qDouble;
          return { id: r.Id, name: r.Name, snippets: getMatchingSnippets(markup, q), linkType: 'VisualforcePage' };
        } catch { return null; }
      }));
      results.push(...batch.filter(Boolean));
    }
    return results;
  }
}
