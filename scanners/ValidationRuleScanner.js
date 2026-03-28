import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ValidationRuleScanner extends MetadataScanner {
  get label() { return 'Validation Rules'; }

  async scan(objName, value) {
    let list;
    try {
      list = await toolingQuery(
        `SELECT Id, ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objName}'`
      );
    } catch { return []; }

    const qDouble = '"' + value + '"';
    const qSingle = "'" + value + "'";

    const BATCH = 10;
    const results = [];
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = await Promise.all(list.slice(i, i + BATCH).map(async vr => {
        try {
          const detail = await toolingQuery(`SELECT Id, ValidationName, Metadata FROM ValidationRule WHERE Id = '${vr.Id}'`);
          if (!detail.length) return null;
          const formula = detail[0].Metadata?.errorConditionFormula || '';
          if (!formula.includes(qDouble) && !formula.includes(qSingle)) return null;
          const q = formula.includes(qDouble) ? qDouble : qSingle;
          return { id: vr.Id, name: vr.ValidationName, snippets: getMatchingSnippets(formula, q), linkType: 'ValidationRule' };
        } catch { return null; }
      }));
      results.push(...batch.filter(Boolean));
    }
    return results;
  }
}
