import { toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class AuraComponentScanner extends MetadataScanner {
  get label() { return 'Aura Components'; }

  async scan(_objName, value) {
    let records;
    try {
      records = await toolingQueryAll(
        `SELECT Id, AuraDefinitionBundleId, AuraDefinitionBundle.DeveloperName, DefType, Source FROM AuraDefinition WHERE DefType IN ('COMPONENT','CONTROLLER','HELPER')`
      );
    } catch { return []; }

    const q = "'" + value + "'";
    const bundles = new Map();
    for (const r of records) {
      if (!(r.Source || '').includes(q)) continue;
      const bundleId = r.AuraDefinitionBundleId;
      const name = r.AuraDefinitionBundle?.DeveloperName || bundleId;
      if (!bundles.has(bundleId)) bundles.set(bundleId, { id: bundleId, name, snippets: [] });
      const entry = bundles.get(bundleId);
      entry.snippets.push(...getMatchingSnippets(r.Source, q, 3 - entry.snippets.length));
    }

    return Array.from(bundles.values()).map(b => ({ ...b, linkType: 'AuraComponent' }));
  }
}
