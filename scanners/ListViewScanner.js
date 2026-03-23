import { sfFetch } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ListViewScanner extends MetadataScanner {
  get label() { return 'List Views'; }

  async scan(objName, value) {
    // Collect all list views, following pagination
    const views = [];
    let url = `/services/data/v59.0/sobjects/${objName}/listviews`;
    try {
      while (url) {
        const d = await sfFetch(url);
        views.push(...(d.listviews || []));
        url = d.nextRecordsUrl || null;
      }
    } catch { return []; }

    const q = "'" + value + "'";
    const results = [];

    for (const view of views) {
      try {
        const describe = await sfFetch(`/services/data/v59.0/sobjects/${objName}/listviews/${view.id}/describe`);

        // Primary: search the SOQL query string — always contains the picklist value in single quotes
        const query = describe.query || '';
        const snippets = getMatchingSnippets(query, q);

        // Fallback: structured filters array (not always populated)
        if (snippets.length === 0) {
          const filters = describe.filters || [];
          for (const f of filters) {
            if (f.value === value) snippets.push(`${f.fieldApiName || f.field} ${f.operation} ${f.value}`);
            if (snippets.length >= 3) break;
          }
        }

        if (snippets.length > 0) {
          results.push({ id: view.id, name: view.label, snippets: [], linkType: 'ListView' });
        }
      } catch { /* skip */ }
    }

    return results;
  }
}
