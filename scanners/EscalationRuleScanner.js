import { getSession, restQuery, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class EscalationRuleScanner extends MetadataScanner {
  get label() { return 'Escalation Rules'; }

  async scan(objName, value) {
    if (objName !== 'Case') return [];

    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'EscalationRule' }];
    }

    // Build DeveloperName → Id map from SOQL so we can link to individual rules
    const ruleIdMap = new Map();
    try {
      const soqlRules = await restQuery(`SELECT Id, DeveloperName FROM EscalationRule`);
      for (const r of soqlRules) ruleIdMap.set(r.DeveloperName, r.Id);
    } catch { /* optional — proceed without IDs */ }

    // Try both singular and plural type names
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

    const containerNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)].map(m => m[1]);
    if (!containerNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const containerName of containerNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>${typeName}</met:type>
            <met:fullNames>${containerName}</met:fullNames>
          </met:readMetadata>`);

        // readMetadata for EscalationRules returns <escalationRule> blocks —
        // each block is one named rule; the outer <fullName> is just the container ("Case")
        const ruleBlocks = [...readXml.matchAll(/<escalationRule>([\s\S]*?)<\/escalationRule>/g)];
        for (const [, ruleXml] of ruleBlocks) {
          if (!ruleXml.includes(`<value>${xmlValue}</value>`)) continue;
          const ruleName = ruleXml.match(/<fullName>([^<]+)<\/fullName>/)?.[1] || containerName;
          const ruleId = ruleIdMap.get(ruleName) || '';
          results.push({ id: ruleId, name: ruleName, snippets: [], linkType: 'EscalationRule' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
