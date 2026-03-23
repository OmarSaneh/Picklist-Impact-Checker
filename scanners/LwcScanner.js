import { toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class LwcScanner extends MetadataScanner {
  get label() { return 'LWC'; }

  async scan(_objName, value) {
    let resources;
    try {
      resources = await toolingQueryAll(
        `SELECT Id, FilePath, Source, LightningComponentBundle.DeveloperName FROM LightningComponentResource`
      );
    } catch { return []; }

    const qSingle = "'" + value + "'";
    const qDouble = '"' + value + '"';

    // Group results by bundle so each component appears once
    const byBundle = new Map();
    for (const r of resources) {
      const source = r.Source || '';
      if (!source.includes(qSingle) && !source.includes(qDouble)) continue;
      const bundleName = r.LightningComponentBundle?.DeveloperName || r.FilePath;
      const q = source.includes(qSingle) ? qSingle : qDouble;
      if (!byBundle.has(bundleName)) {
        byBundle.set(bundleName, { snippets: [] });
      }
      byBundle.get(bundleName).snippets.push(...getMatchingSnippets(source, q));
    }

    return [...byBundle.entries()].map(([name, { snippets }]) => ({
      id: '',
      name,
      snippets,
      linkType: 'LWC',
    }));
  }
}
