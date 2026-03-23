import { getSession, soapMetadata } from '../api.js';
import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class PathAssistantScanner extends MetadataScanner {
  get label() { return 'Path Assistants'; }

  async scan(_objName, value) {
    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: null }];
    }

    let list;
    try {
      list = await toolingQuery(
        `SELECT FullName, MasterLabel, SobjectType, SobjectProcessField FROM PathAssistant`
      );
    } catch { return []; }
    if (!list.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const pa of list) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>PathAssistant</met:type>
            <met:fullNames>${pa.FullName}</met:fullNames>
          </met:readMetadata>`);
        if (readXml.includes(`<fieldValue>${xmlValue}</fieldValue>`)) {
          const name = pa.MasterLabel || `${pa.SobjectType} · ${pa.SobjectProcessField}`;
          results.push({ id: '', name, snippets: [], linkType: 'plain' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
