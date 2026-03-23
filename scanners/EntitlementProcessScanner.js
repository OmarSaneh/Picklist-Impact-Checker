import { getSession, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class EntitlementProcessScanner extends MetadataScanner {
  get label() { return 'Entitlement Processes'; }

  async scan(objName, value) {
    // Entitlement Processes apply to Case and WorkOrder
    if (objName !== 'Case' && objName !== 'WorkOrder') return [];

    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'EntitlementProcess' }];
    }

    let listXml;
    try {
      listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>EntitlementProcess</met:type></met:queries>
        </met:listMetadata>`);
    } catch { return []; }

    const fullNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)].map(m => m[1]);
    if (!fullNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const fullName of fullNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>EntitlementProcess</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);
        if (readXml.includes(`<value>${xmlValue}</value>`)) {
          results.push({ id: '', name: fullName, snippets: [], linkType: 'EntitlementProcess' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
