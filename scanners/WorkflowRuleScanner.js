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

    const q = '"' + value + '"';
    const BATCH = 10;
    const results = [];

    for (let i = 0; i < list.length; i += BATCH) {
      const batch = await Promise.all(list.slice(i, i + BATCH).map(async wr => {
        try {
          const detail = await toolingQuery(`SELECT Id, Name, Metadata FROM WorkflowRule WHERE Id = '${wr.Id}'`);
          if (!detail.length) return null;
          const json = JSON.stringify(detail[0].Metadata || '');
          if (!json.includes(q)) return null;
          return { id: wr.Id, name: wr.Name, snippets: getMatchingSnippets(json, q), linkType: 'WorkflowRule' };
        } catch { return null; }
      }));
      results.push(...batch.filter(Boolean));
    }
    return results;
  }
}
