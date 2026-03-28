import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class WorkflowRuleScanner extends MetadataScanner {
  get label() { return 'Workflow Rules'; }

  async scan(objName, value) {
    // Standard objects: TableEnumOrId stores the API name (e.g. 'Case')
    // Custom objects: TableEnumOrId stores the entity ID — resolve via EntityDefinition
    let tableId = objName;
    if (objName.endsWith('__c')) {
      try {
        const entityDef = await toolingQuery(`SELECT Id FROM EntityDefinition WHERE QualifiedApiName = '${objName}'`);
        if (entityDef.length) tableId = entityDef[0].Id;
      } catch { /* fall back to name */ }
    }

    let list;
    try { list = await toolingQuery(`SELECT Id, Name FROM WorkflowRule WHERE TableEnumOrId = '${tableId}'`); } catch { return []; }

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
