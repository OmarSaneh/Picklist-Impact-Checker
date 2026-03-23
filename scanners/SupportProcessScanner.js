import { getSession, restQuery, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class SupportProcessScanner extends MetadataScanner {
  get label() { return 'Support Processes'; }

  async scan(objName, value) {
    if (objName !== 'Case') return [];

    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: null }];
    }

    // Support Processes in the Metadata API are BusinessProcess records
    // with fullName = "Case.{processName}"
    let fullNames = [];
    try {
      const listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>BusinessProcess</met:type></met:queries>
        </met:listMetadata>`);
      fullNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)]
        .map(m => m[1])
        .filter(n => n.startsWith('Case.'));
    } catch { /* fall through */ }

    // Fallback: REST SOQL for process names, then construct fullName
    if (!fullNames.length) {
      try {
        const processes = await restQuery(`SELECT Id, Name FROM SupportProcess`);
        fullNames = processes.map(p => `Case.${p.Name}`);
      } catch { return []; }
    }
    if (!fullNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const fullName of fullNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>BusinessProcess</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);
        // Values are in <values><fullName>StatusValue</fullName></values>
        const matched = [...readXml.matchAll(/<values>([\s\S]*?)<\/values>/g)]
          .some(([, xml]) => xml.includes(`<fullName>${xmlValue}</fullName>`));
        if (matched) {
          const name = fullName.replace(/^Case\./, '');
          results.push({ id: '', name, snippets: [], linkType: 'SupportProcess' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
