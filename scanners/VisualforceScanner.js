import { toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class VisualforceScanner extends MetadataScanner {
  get label() { return 'Visualforce Pages'; }

  async scan(_objName, value) {
    let records;
    try { records = await toolingQueryAll(`SELECT Id, Name, Markup FROM ApexPage`); } catch { return []; }
    const q = "'" + value + "'";
    return records
      .filter(r => (r.Markup || '').includes(q))
      .map(r => ({ id: r.Id, name: r.Name, snippets: getMatchingSnippets(r.Markup, q), linkType: 'VisualforcePage' }));
  }
}
