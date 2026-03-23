import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class RecordTypeScanner extends MetadataScanner {
  get label() { return 'Record Types'; }

  async scan(objName, value) {
    let list;
    try {
      list = await toolingQuery(`SELECT Id, DeveloperName FROM RecordType WHERE SobjectType = '${objName}'`);
    } catch { return []; }
    if (!list.length) return [];

    const results = [];
    for (const rt of list) {
      try {
        const detail = await toolingQuery(`SELECT Id, DeveloperName, Metadata FROM RecordType WHERE Id = '${rt.Id}'`);
        if (!detail.length) continue;
        const matchingFields = (detail[0].Metadata?.picklistValues || [])
          .filter(pv => (pv.values || []).some(v => v.fullName === value))
          .map(pv => pv.picklist);
        if (matchingFields.length) {
          results.push({ id: rt.Id, name: rt.DeveloperName, snippets: matchingFields, linkType: 'RecordType' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
