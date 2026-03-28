import { toolingQuery, toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class AuraComponentScanner extends MetadataScanner {
  get label() { return 'Aura Components'; }

  async scan(_objName, value) {
    let records;
    try {
      // List Id + bundle info only — bulk SOQL truncates Source on large files
      // Include EVENT and APPLICATION — they can hardcode picklist defaults in attributes
      records = await toolingQueryAll(
        `SELECT Id, AuraDefinitionBundleId, AuraDefinitionBundle.DeveloperName, DefType FROM AuraDefinition WHERE DefType IN ('COMPONENT','CONTROLLER','HELPER','EVENT','APPLICATION','RENDERER')`
      );
    } catch { return []; }

    const qSingle = "'" + value + "'";
    const qDouble = '"' + value + '"';

    // Per-record fetch for full Source, parallelised in batches of 10
    const BATCH = 10;
    const bundles = new Map();

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = await Promise.all(records.slice(i, i + BATCH).map(async r => {
        try {
          const detail = await toolingQuery(`SELECT Id, Source FROM AuraDefinition WHERE Id = '${r.Id}'`);
          if (!detail.length) return null;
          return { ...r, Source: detail[0].Source };
        } catch { return null; }
      }));

      for (const r of batch) {
        if (!r) continue;
        const source = r.Source || '';
        if (!source.includes(qSingle) && !source.includes(qDouble)) continue;
        const bundleId = r.AuraDefinitionBundleId;
        const name = r.AuraDefinitionBundle?.DeveloperName || bundleId;
        const q = source.includes(qSingle) ? qSingle : qDouble;
        if (!bundles.has(bundleId)) bundles.set(bundleId, { id: bundleId, name, snippets: [] });
        const entry = bundles.get(bundleId);
        entry.snippets.push(...getMatchingSnippets(source, q, 3 - entry.snippets.length));
      }
    }

    return Array.from(bundles.values()).map(b => ({ ...b, linkType: 'AuraComponent' }));
  }
}
