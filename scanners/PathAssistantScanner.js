import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class PathAssistantScanner extends MetadataScanner {
  get label() { return 'Path Assistants'; }

  async scan(_objName, value) {
    let list;
    try { list = await toolingQuery(`SELECT Id, DeveloperName FROM PathAssistant`); } catch { return []; }

    const results = [];
    for (const pa of list) {
      try {
        const detail = await toolingQuery(`SELECT Id, DeveloperName, Metadata FROM PathAssistant WHERE Id = '${pa.Id}'`);
        if (!detail.length) continue;
        const steps = detail[0].Metadata?.pathAssistantSteps || [];
        if (steps.some(step => step.fieldValue === value)) {
          results.push({ id: pa.Id, name: detail[0].DeveloperName, snippets: [], linkType: 'PathAssistant' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
