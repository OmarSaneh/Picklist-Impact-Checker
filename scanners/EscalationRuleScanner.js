import { getSession, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class EscalationRuleScanner extends MetadataScanner {
  get label() { return 'Escalation Rules'; }

  async scan(objName, value) {
    // Escalation Rules are Case-only in Salesforce
    if (objName !== 'Case') return [];

    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'EscalationRule' }];
    }

    let listXml;
    try {
      listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>EscalationRule</met:type></met:queries>
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
            <met:type>EscalationRule</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);
        if (readXml.includes(`<value>${xmlValue}</value>`)) {
          results.push({ id: '', name: fullName, snippets: [], linkType: 'EscalationRule' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
