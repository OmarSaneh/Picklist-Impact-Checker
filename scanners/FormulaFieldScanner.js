import { toolingQuery, toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class FormulaFieldScanner extends MetadataScanner {
  get label() { return 'Formula Fields'; }

  async scan(objName, value) {
    let entityDef;
    try { entityDef = await toolingQuery(`SELECT Id FROM EntityDefinition WHERE QualifiedApiName = '${objName}'`); } catch { return []; }
    if (!entityDef.length) return [];
    const entityId = entityDef[0].Id;

    // Include Metadata in the bulk query to avoid N+1 per-field calls
    let list;
    try { list = await toolingQueryAll(`SELECT Id, DeveloperName, Metadata FROM CustomField WHERE EntityDefinitionId = '${entityId}'`); } catch { return []; }

    const qDouble = '"' + value + '"';
    const qSingle = "'" + value + "'";
    return list
      .filter(f => { const formula = f.Metadata?.formula || ''; return formula.includes(qDouble) || formula.includes(qSingle); })
      .map(f => {
        const formula = f.Metadata.formula;
        const q = formula.includes(qDouble) ? qDouble : qSingle;
        return { id: f.Id, name: f.DeveloperName, snippets: getMatchingSnippets(formula, q), linkType: 'FormulaField' };
      });
  }
}
