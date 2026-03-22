import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class PathAssistantScanner extends MetadataScanner {
  get label() { return 'Path Assistants'; }

  async scan(_objName, value) {
    let records;
    try { records = await toolingQuery(`SELECT Id, MasterLabel, Metadata FROM PathAssistant`); } catch { return []; }
    const results = [];
    for (const r of records) {
      const steps = r.Metadata?.pathAssistantSteps || [];
      const matchingSteps = steps.filter(step => step.fieldValue === value);
      if (matchingSteps.length > 0) {
        results.push({
          id: r.Id,
          name: r.MasterLabel,
          snippets: matchingSteps.slice(0, 3).map(step => `Step: ${step.fieldValue}`),
          linkType: 'PathAssistant',
        });
      }
    }
    return results;
  }
}
