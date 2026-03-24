import { getSession, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class AssignmentRuleScanner extends MetadataScanner {
  get label() { return 'Assignment Rules'; }

  async scan(objName, value) {
    if (objName !== 'Case' && objName !== 'Lead') return [];

    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'plain' }];
    }

    let listXml;
    try {
      listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>AssignmentRules</met:type></met:queries>
        </met:listMetadata>`);
    } catch { return []; }

    const containerNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)]
      .map(m => m[1])
      .filter(n => n.toLowerCase() === objName.toLowerCase());
    if (!containerNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const containerName of containerNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>AssignmentRules</met:type>
            <met:fullNames>${containerName}</met:fullNames>
          </met:readMetadata>`);

        for (const [, ruleXml] of readXml.matchAll(/<assignmentRule>([\s\S]*?)<\/assignmentRule>/g)) {
          if (!ruleXml.includes(`<value>${xmlValue}</value>`)) continue;
          const ruleName = ruleXml.match(/<fullName>([^<]+)<\/fullName>/)?.[1] || containerName;
          results.push({ id: '', name: ruleName, snippets: [], linkType: 'plain' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
