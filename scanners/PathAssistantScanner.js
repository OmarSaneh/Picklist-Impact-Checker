import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class PathAssistantScanner extends MetadataScanner {
  get label() { return 'Path Assistants'; }

  async scan(_objName, value) {
    let list;
    try {
      list = await toolingQuery(`SELECT Id, MasterLabel FROM PathAssistant`);
    } catch { return []; }
    if (!list.length) return [];

    const results = [];
    for (const pa of list) {
      try {
        const steps = await toolingQuery(
          `SELECT FieldValue FROM PathAssistantStepItem WHERE PathAssistantId = '${pa.Id}'`
        );
        if (steps.some(s => s.FieldValue === value)) {
          results.push({ id: '', name: pa.MasterLabel, snippets: [], linkType: 'plain' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
