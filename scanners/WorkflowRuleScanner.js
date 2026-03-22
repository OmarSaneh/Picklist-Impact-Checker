import { toolingQuery } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class WorkflowRuleScanner extends MetadataScanner {
  get label() { return 'Workflow Rules'; }
  get progressPct() { return 90; }

  async scan(objName, value) {
    let records;
    try { records = await toolingQuery(`SELECT Id, Name, Metadata FROM WorkflowRule WHERE TableEnumOrId = '${objName}'`); } catch { return []; }
    const q = '"' + value + '"';
    return records.filter(r => JSON.stringify(r.Metadata || '').includes(q)).map(r => ({
      id: r.Id, name: r.Name, snippets: getMatchingSnippets(JSON.stringify(r.Metadata || ''), q), linkType: 'WorkflowRule',
    }));
  }
}
