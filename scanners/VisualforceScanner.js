import { toolingQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class VisualforceScanner extends MetadataScanner {
  get label() { return 'Visualforce Pages'; }

  async scan(_objName, value) {
    const q = "'" + value + "'";
    const [pages, components] = await Promise.all([
      toolingQueryAll(`SELECT Id, Name, Markup FROM ApexPage`).catch(() => []),
      toolingQueryAll(`SELECT Id, Name, Markup FROM ApexComponent`).catch(() => []),
    ]);
    return [...pages, ...components]
      .filter(r => (r.Markup || '').includes(q))
      .map(r => ({ id: r.Id, name: r.Name, snippets: getMatchingSnippets(r.Markup, q), linkType: 'VisualforcePage' }));
  }
}
