import { toolingQuery, toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class FormulaFieldScanner extends MetadataScanner {
  get label() { return 'Formula Fields'; }

  async scan(objName, value) {
    // Pre-filter to formula fields only — avoids fetching Metadata for every field
    let formulaDefs;
    try {
      formulaDefs = await toolingQueryAll(
        `SELECT DeveloperName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objName}' AND IsFormula = true`
      );
    } catch { return []; }
    if (!formulaDefs.length) return [];

    // Resolve EntityDefinition Id (needed for CustomField filter)
    let entityDef;
    try { entityDef = await toolingQuery(`SELECT Id FROM EntityDefinition WHERE QualifiedApiName = '${objName}'`); } catch { return []; }
    if (!entityDef.length) return [];
    const entityId = entityDef[0].Id;

    // FieldDefinition.DeveloperName includes __c; CustomField.DeveloperName does not
    const formulaNames = new Set(formulaDefs.map(f => f.DeveloperName.replace(/__c$/i, '')));

    let list;
    try { list = await toolingQueryAll(`SELECT Id, DeveloperName FROM CustomField WHERE EntityDefinitionId = '${entityId}'`); } catch { return []; }
    const formulaFields = list.filter(f => formulaNames.has(f.DeveloperName));
    if (!formulaFields.length) return [];

    const qDouble = '"' + value + '"';
    const qSingle = "'" + value + "'";
    const results = [];

    // Tooling API Metadata compound field requires per-record queries
    for (const field of formulaFields) {
      try {
        const detail = await toolingQuery(`SELECT Id, DeveloperName, Metadata FROM CustomField WHERE Id = '${field.Id}'`);
        if (!detail.length) continue;
        const formula = detail[0].Metadata?.formula || '';
        if (formula.includes(qDouble) || formula.includes(qSingle)) {
          const q = formula.includes(qDouble) ? qDouble : qSingle;
          results.push({ id: field.Id, name: field.DeveloperName, snippets: getMatchingSnippets(formula, q), linkType: 'FormulaField' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
