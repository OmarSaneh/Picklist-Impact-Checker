import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ValidationRuleScanner extends MetadataScanner {
  get label() { return 'Validation Rules'; }
  get progressPct() { return 5; }

  async scan(objName, value) {
    const list = await toolingQuery(
      `SELECT Id, ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objName}'`
    );
    const results = [];
    const q = "'" + value + "'";
    for (const vr of list) {
      try {
        const detail = await toolingQuery(`SELECT Id, ValidationName, Metadata FROM ValidationRule WHERE Id = '${vr.Id}'`);
        if (!detail.length) continue;
        const formula = detail[0].Metadata?.errorConditionFormula || '';
        if (formula.includes(q)) results.push({ id: vr.Id, name: vr.ValidationName, snippets: getMatchingSnippets(formula, q), linkType: 'ValidationRule' });
      } catch { /* skip */ }
    }
    return results;
  }
}
