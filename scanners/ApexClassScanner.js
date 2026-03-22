import { toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ApexClassScanner extends MetadataScanner {
  get label() { return 'Apex Classes'; }
  get progressPct() { return 58; }

  async scan(_objName, value) {
    let records;
    try { records = await toolingQueryAll(`SELECT Id, Name, Body FROM ApexClass`); } catch { return []; }
    const q = "'" + value + "'";
    return records.filter(r => (r.Body || '').includes(q)).map(r => ({ id: r.Id, name: r.Name, snippets: getMatchingSnippets(r.Body, q), linkType: 'ApexClass' }));
  }
}
