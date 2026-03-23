import { sfFetch, toolingQuery } from '../api.js';
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
        // UI API returns the real available values per picklist field for this record type,
        // whether the record type explicitly restricts them or inherits all from master.
        const data = await sfFetch(`/services/data/v59.0/ui-api/object-info/${objName}/picklist-values/${rt.Id}`);
        const matchingFields = Object.entries(data.picklistFieldValues || {})
          .filter(([, fd]) => (fd.values || []).some(v => v.value === value))
          .map(([fieldName]) => fieldName);
        if (matchingFields.length) {
          results.push({ id: rt.Id, name: rt.DeveloperName, snippets: matchingFields, linkType: 'RecordType' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
