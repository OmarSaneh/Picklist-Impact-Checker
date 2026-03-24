import { getSession, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class SalesProcessScanner extends MetadataScanner {
  get label() { return 'Sales & Lead Processes'; }

  async scan(objName, value) {
    if (objName !== 'Opportunity' && objName !== 'Lead') return [];

    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'plain' }];
    }

    let listXml;
    try {
      listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>BusinessProcess</met:type></met:queries>
        </met:listMetadata>`);
    } catch { return []; }

    // Sales processes have fullName "Opportunity.ProcessName"; Lead processes "Lead.ProcessName"
    const prefix = `${objName}.`;
    const fullNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)]
      .map(m => m[1])
      .filter(n => n.startsWith(prefix));
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

        const matched = [...readXml.matchAll(/<values>([\s\S]*?)<\/values>/g)]
          .some(([, xml]) => xml.includes(`<fullName>${xmlValue}</fullName>`));
        if (matched) {
          results.push({ id: '', name: fullName.slice(prefix.length), snippets: [], linkType: 'plain' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
