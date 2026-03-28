import { toolingQueryAll, restQueryAll, sfFetch } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class CustomMetadataScanner extends MetadataScanner {
  get label() { return 'Custom Metadata'; }

  async scan(_objName, value) {
    // Discover all Custom Metadata Type objects in the org
    let cmtTypes;
    try {
      cmtTypes = await toolingQueryAll(
        `SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName LIKE '%__mdt'`
      );
    } catch { return []; }

    if (!cmtTypes.length) return [];

    // For each CMT type: describe → find custom text/picklist fields → query records
    // Use describe (not FieldDefinition relationship traversal) to avoid Tooling API quirks
    const BATCH = 5;
    const results = [];

    for (let i = 0; i < cmtTypes.length; i += BATCH) {
      const batch = await Promise.all(cmtTypes.slice(i, i + BATCH).map(async ({ QualifiedApiName: typeName }) => {
        try {
          const desc = await sfFetch(`/services/data/v59.0/sobjects/${typeName}/describe`);
          // Only check custom fields — standard CMT fields (MasterLabel, DeveloperName, etc.) are
          // metadata identifiers, not configuration values a developer would hardcode a picklist value into
          const textFields = (desc.fields || [])
            .filter(f => f.name.endsWith('__c') && (f.type === 'string' || f.type === 'picklist' || f.type === 'textarea'))
            .map(f => f.name);

          if (!textFields.length) return [];

          const records = await restQueryAll(
            `SELECT Id, MasterLabel, DeveloperName, ${textFields.join(', ')} FROM ${typeName}`
          );

          const hits = [];
          for (const rec of records) {
            for (const fn of textFields) {
              if (String(rec[fn] ?? '') === value) {
                hits.push({
                  id: rec.Id,
                  name: `${typeName}: ${rec.MasterLabel || rec.DeveloperName}`,
                  snippets: [`${fn}: ${value}`],
                  linkType: 'CustomMetadata',
                });
                break; // one match per record is enough
              }
            }
          }
          return hits;
        } catch { return []; }
      }));
      results.push(...batch.flat());
    }

    return results;
  }
}
