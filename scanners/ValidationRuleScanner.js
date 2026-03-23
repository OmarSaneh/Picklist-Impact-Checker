import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ValidationRuleScanner extends MetadataScanner {
  get label() { return 'Validation Rules'; }

  async scan(objName, value) {
    const list = await toolingQuery(
      `SELECT Id, ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objName}'`
    );
    const results = [];
    const qDouble = '"' + value + '"';
    const qSingle = "'" + value + "'";
    for (const vr of list) {
      try {
        const detail = await toolingQuery(`SELECT Id, ValidationName, Metadata FROM ValidationRule WHERE Id = '${vr.Id}'`);
        if (!detail.length) continue;
        const formula = detail[0].Metadata?.errorConditionFormula || '';
        const q = formula.includes(qDouble) ? qDouble : qSingle;
        if (formula.includes(qDouble) || formula.includes(qSingle)) {
          results.push({ id: vr.Id, name: vr.ValidationName, snippets: getMatchingSnippets(formula, q), linkType: 'ValidationRule' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
