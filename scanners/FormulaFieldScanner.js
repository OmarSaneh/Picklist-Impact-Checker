import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class FormulaFieldScanner extends MetadataScanner {
  get label() { return 'Formula Fields'; }

  async scan(objName, value) {
    let entityDef;
    try { entityDef = await toolingQuery(`SELECT Id FROM EntityDefinition WHERE QualifiedApiName = '${objName}'`); } catch { return []; }
    if (!entityDef.length) return [];
    const entityId = entityDef[0].Id;

    let list;
    try { list = await toolingQuery(`SELECT Id, DeveloperName FROM CustomField WHERE EntityDefinitionId = '${entityId}'`); } catch { return []; }

    const results = [];
    const q = "'" + value + "'";
    for (const field of list) {
      try {
        const detail = await toolingQuery(`SELECT Id, DeveloperName, Metadata FROM CustomField WHERE Id = '${field.Id}'`);
        if (!detail.length) continue;
        const formula = detail[0].Metadata?.formula || '';
        if (formula.includes(q)) results.push({ id: field.Id, name: field.DeveloperName, snippets: getMatchingSnippets(formula, q), linkType: 'FormulaField' });
      } catch { /* skip */ }
    }
    return results;
  }
}
