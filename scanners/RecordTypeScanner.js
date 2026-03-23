import { sfFetch } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class RecordTypeScanner extends MetadataScanner {
  get label() { return 'Record Types'; }

  async scan(objName, value) {
    let describe;
    try {
      describe = await sfFetch(`/services/data/v59.0/sobjects/${objName}/describe/`);
    } catch { return []; }

    // Skip the master record type (id 012000000000000AAA) — it's not a real record type
    const recordTypes = (describe.recordTypeInfos || []).filter(rt => !rt.master && rt.active);
    if (!recordTypes.length) return [];

    const results = [];
    for (const rt of recordTypes) {
      try {
        const data = await sfFetch(`/services/data/v59.0/ui-api/object-info/${objName}/picklist-values/${rt.recordTypeId}`);
        const matchingFields = Object.entries(data.picklistFieldValues || {})
          .filter(([, fd]) => (fd.values || []).some(v => v.value === value))
          .map(([fieldName]) => fieldName);
        if (matchingFields.length) {
          results.push({ id: rt.recordTypeId, name: rt.developerName || rt.name, snippets: [], linkType: 'RecordType' });
        }
      } catch { /* skip this record type */ }
    }
    return results;
  }
}
