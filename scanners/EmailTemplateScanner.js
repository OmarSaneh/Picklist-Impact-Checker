import { restQueryAll } from '../api.js';
import { getMatchingSnippets } from '../utils.js';
import { MetadataScanner } from './MetadataScanner.js';

export class EmailTemplateScanner extends MetadataScanner {
  get label() { return 'Email Templates'; }

  async scan(_objName, value) {
    let records;
    try { records = await restQueryAll(`SELECT Id, Name, HtmlValue, Body FROM EmailTemplate`); } catch { return []; }
    const q = "'" + value + "'";
    const results = [];
    for (const r of records) {
      const htmlSnippets = getMatchingSnippets(r.HtmlValue || '', q);
      const bodySnippets = getMatchingSnippets(r.Body || '', q);
      const snippets = [...htmlSnippets, ...bodySnippets].slice(0, 3);
      if (snippets.length > 0) results.push({ id: r.Id, name: r.Name, snippets: [], linkType: 'EmailTemplate' });
    }
    return results;
  }
}
