import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class PathAssistantScanner extends MetadataScanner {
  get label() { return 'Path Assistants'; }

  async scan(_objName, value) {
    let paths;
    try {
      paths = await toolingQuery(`SELECT Id, MasterLabel FROM PathAssistant`);
    } catch { return []; }
    if (!paths.length) return [];

    const results = [];
    for (const pa of paths) {
      try {
        // ItemId is polymorphic: 0EH = PicklistEntry, 1CF = PathAssistantStepInfo
        // Item.Value traverses the PicklistEntry relationship to get the picklist value
        const items = await toolingQuery(
          `SELECT ItemId, Item.Value FROM PathAssistantStepItem WHERE PathAssistantId = '${pa.Id}'`
        );
        if (items.some(i => i.Item?.Value === value)) {
          results.push({ id: '', name: pa.MasterLabel, snippets: [], linkType: 'plain' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
