import { sfFetch } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class OmnistudioScanner extends MetadataScanner {
  get label() { return 'Omnistudio'; }

  async scan(_objName, value) {
    // Probe for OmniProcess — silently returns [] on orgs without Omnistudio
    let list;
    try {
      const data = await sfFetch(
        `/services/data/v59.0/query?q=${encodeURIComponent('SELECT Id, Name, Type FROM OmniProcess WHERE IsActive = true')}`
      );
      list = data.records || [];
    } catch { return []; }

    if (!list.length) return [];

    // Per-record fetch for full process definition (OmniProcessElements can be large)
    const jq = '"' + value + '"';
    const BATCH = 10;
    const results = [];

    for (let i = 0; i < list.length; i += BATCH) {
      const batch = await Promise.all(list.slice(i, i + BATCH).map(async r => {
        try {
          const data = await sfFetch(`/services/data/v59.0/sobjects/OmniProcess/${r.Id}`);
          if (!JSON.stringify(data).includes(jq)) return null;
          return { id: r.Id, name: `${r.Name} (${r.Type})`, snippets: [], linkType: 'Omnistudio' };
        } catch { return null; }
      }));
      results.push(...batch.filter(Boolean));
    }

    return results;
  }
}
