import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class WorkflowRuleScanner extends MetadataScanner {
  get label() { return 'Workflow Rules'; }

  async scan(objName, value) {
    let entityDef;
    try { entityDef = await toolingQuery(`SELECT Id FROM EntityDefinition WHERE QualifiedApiName = '${objName}'`); } catch { return []; }
    if (!entityDef.length) return [];
    const entityId = entityDef[0].Id;

    let list;
    try { list = await toolingQuery(`SELECT Id, Name FROM WorkflowRule WHERE TableEnumOrId = '${entityId}'`); } catch { return []; }

    const results = [];
    const q = '"' + value + '"';
    for (const wr of list) {
      try {
        const detail = await toolingQuery(`SELECT Id, Name, Metadata FROM WorkflowRule WHERE Id = '${wr.Id}'`);
        if (!detail.length) continue;
        const json = JSON.stringify(detail[0].Metadata || '');
        if (json.includes(q)) results.push({ id: wr.Id, name: wr.Name, snippets: getMatchingSnippets(json, q), linkType: 'WorkflowRule' });
      } catch { /* skip */ }
    }
    return results;
  }
}
