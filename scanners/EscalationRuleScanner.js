import { getSession, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class EscalationRuleScanner extends MetadataScanner {
  get label() { return 'Escalation Rules'; }

  async scan(objName, value) {
    if (objName !== 'Case') return [];

    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'EscalationRule' }];
    }

    // Try both singular and plural type names — Salesforce metadata type
    // is 'EscalationRules' (matching the .escalationRules file extension)
    let listXml, typeName;
    for (const t of ['EscalationRules', 'EscalationRule']) {
      try {
        listXml = await soapMetadata(instanceUrl, sid, `
          <met:listMetadata>
            <met:queries><met:type>${t}</met:type></met:queries>
          </met:listMetadata>`);
        typeName = t;
        break;
      } catch { /* try next */ }
    }
    if (!listXml) return [];

    const fullNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)].map(m => m[1]);
    if (!fullNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const fullName of fullNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>${typeName}</met:type>
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
