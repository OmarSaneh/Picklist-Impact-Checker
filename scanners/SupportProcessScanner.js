import { getSession, restQuery, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class SupportProcessScanner extends MetadataScanner {
  get label() { return 'Support Processes'; }

  async scan(objName, value) {
    if (objName !== 'Case') return [];

    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'SupportProcess' }];
    }

    // Try SOAP listMetadata first — it returns the exact fullName needed for readMetadata
    let fullNames = [];
    try {
      const listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>SupportProcess</met:type></met:queries>
        </met:listMetadata>`);
      fullNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)].map(m => m[1]);
    } catch { /* fall through to REST fallback */ }

    // Fallback: get names via REST SOQL if SOAP listMetadata returned nothing
    if (!fullNames.length) {
      try {
        const processes = await restQuery(`SELECT Id, Name FROM SupportProcess`);
        fullNames = processes.map(p => p.Name);
      } catch { return []; }
    }
    if (!fullNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const fullName of fullNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>SupportProcess</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);
        if (readXml.includes(`<caseStatus>${xmlValue}</caseStatus>`)) {
          results.push({ id: '', name: fullName, snippets: [], linkType: 'SupportProcess' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
