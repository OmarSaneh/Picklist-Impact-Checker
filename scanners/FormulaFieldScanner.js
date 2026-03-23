import { sfFetch } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class FormulaFieldScanner extends MetadataScanner {
  get label() { return 'Formula Fields'; }

  async scan(objName, value) {
    let describe;
    try { describe = await sfFetch(`/services/data/v59.0/sobjects/${objName}/describe/`); } catch { return []; }

    const qDouble = '"' + value + '"';
    const qSingle = "'" + value + "'";
    const results = [];

    for (const field of (describe.fields || [])) {
      if (!field.calculated || !field.calculatedFormula) continue;
      const formula = field.calculatedFormula;
      if (!formula.includes(qDouble) && !formula.includes(qSingle)) continue;
      const q = formula.includes(qDouble) ? qDouble : qSingle;
      results.push({ id: '', name: `${objName} · ${field.name}`, snippets: getMatchingSnippets(formula, q), linkType: 'plain' });
    }
    return results;
  }
}
