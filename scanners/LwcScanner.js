import { toolingQuery, toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class LwcScanner extends MetadataScanner {
  get label() { return 'LWC'; }

  async scan(_objName, value) {
    // List Id+FilePath+BundleName only — bulk SOQL truncates Source on large files
    let resources;
    try {
      resources = await toolingQueryAll(
        `SELECT Id, FilePath, LightningComponentBundle.DeveloperName FROM LightningComponentResource`
      );
    } catch { return []; }

    const qSingle = "'" + value + "'";
    const qDouble = '"' + value + '"';

    // Per-record fetch for full Source, parallelised in batches of 10
    const BATCH = 10;
    const byBundle = new Map();

    for (let i = 0; i < resources.length; i += BATCH) {
      const batch = await Promise.all(resources.slice(i, i + BATCH).map(async r => {
        try {
          const detail = await toolingQuery(`SELECT Id, Source FROM LightningComponentResource WHERE Id = '${r.Id}'`);
          if (!detail.length) return null;
          return { ...r, Source: detail[0].Source };
        } catch { return null; }
      }));

      for (const r of batch) {
        if (!r) continue;
        const source = r.Source || '';
        if (!source.includes(qSingle) && !source.includes(qDouble)) continue;
        const bundleName = r.LightningComponentBundle?.DeveloperName || r.FilePath;
        const q = source.includes(qSingle) ? qSingle : qDouble;
        if (!byBundle.has(bundleName)) byBundle.set(bundleName, { snippets: [] });
        byBundle.get(bundleName).snippets.push(...getMatchingSnippets(source, q));
      }
    }

    return [...byBundle.entries()].map(([name, { snippets }]) => ({
      id: '',
      name,
      snippets,
      linkType: 'LWC',
    }));
  }
}
