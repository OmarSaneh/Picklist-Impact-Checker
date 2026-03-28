import { toolingQueryAll, sfFetch } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class PathAssistantScanner extends MetadataScanner {
  get label() { return 'Path Assistants'; }

  async scan(objName, value) {
    let paths;
    try {
      paths = await toolingQueryAll(`SELECT Id, MasterLabel, SobjectType FROM PathAssistant`);
    } catch { return []; }

    const relevant = paths.filter(p => p.SobjectType === objName);
    if (!relevant.length) return [];

    const results = await Promise.all(relevant.map(async p => {
      try {
        const detail = await sfFetch(`/services/data/v59.0/tooling/sobjects/PathAssistant/${p.Id}`);
        const steps = detail.Metadata?.pathAssistantSteps || [];
        if (steps.some(s => s.picklistValueName === value)) {
          return { id: '', name: p.MasterLabel, snippets: [], linkType: 'PathAssistant' };
        }
      } catch { /* skip */ }
      return null;
    }));

    return results.filter(Boolean);
  }
}
