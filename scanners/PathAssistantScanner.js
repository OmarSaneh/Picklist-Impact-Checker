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

    // Try SOAP listMetadata — returns fullNames like "Case-Status", "Opportunity-StageName"
    let fullNames = [];
    try {
      const listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>PathAssistant</met:type></met:queries>
        </met:listMetadata>`);
      fullNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)].map(m => m[1]);
    } catch { /* fall through */ }

    // Fallback: UI-created path assistants may not appear in listMetadata;
    // use Tooling API to get DeveloperNames and try those with readMetadata
    if (!fullNames.length) {
      try {
        const list = await toolingQuery(`SELECT DeveloperName FROM PathAssistant`);
        fullNames = list.map(pa => pa.DeveloperName).filter(Boolean);
      } catch { /* skip */ }
    }
    if (!fullNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const fullName of fullNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>PathAssistant</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);
        if (readXml.includes(`<fieldValue>${xmlValue}</fieldValue>`)) {
          results.push({ id: '', name: fullName, snippets: [], linkType: 'PathAssistant' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
