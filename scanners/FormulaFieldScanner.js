import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class FormulaFieldScanner extends MetadataScanner {
  get label() { return 'Formula Fields'; }
  get progressPct() { return 22; }

  async scan(objName, value) {
    let records;
    try { records = await toolingQuery(`SELECT Id, DeveloperName, Metadata FROM CustomField WHERE TableEnumOrId = '${objName}'`); }
    catch { return []; }
    const results = [];
    const q = "'" + value + "'";
    for (const r of records) {
      const formula = r.Metadata?.formula || '';
      if (formula.includes(q)) results.push({ id: r.Id, name: r.DeveloperName, snippets: getMatchingSnippets(formula, q), linkType: 'FormulaField' });
    }
    return results;
  }
}
