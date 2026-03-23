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

    // Use REST SOQL to list processes — more reliable than listMetadata
    let processes;
    try { processes = await restQuery(`SELECT Id, Name FROM SupportProcess`); } catch { processes = []; }
    if (!processes.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const sp of processes) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>SupportProcess</met:type>
            <met:fullNames>${sp.Name}</met:fullNames>
          </met:readMetadata>`);
        if (readXml.includes(`<caseStatus>${xmlValue}</caseStatus>`)) {
          results.push({ id: '', name: sp.Name, snippets: [], linkType: 'SupportProcess' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
