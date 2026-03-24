import { getSession, soapMetadata, restQuery } from '../api.js';
import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class SharingRuleScanner extends MetadataScanner {
  get label() { return 'Sharing Rules'; }

  async scan(objName, value) {
    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: null }];
    }

    let listXml;
    try {
      listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>SharingRules</met:type></met:queries>
        </met:listMetadata>`);
    } catch { return []; }

    // SharingRules containers match the object API name exactly
    const containerNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)]
      .map(m => m[1])
      .filter(n => n === objName);
    if (!containerNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const matchedNames = [];

    for (const containerName of containerNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>SharingRules</met:type>
            <met:fullNames>${containerName}</met:fullNames>
          </met:readMetadata>`);

        // Only criteria-based sharing rules reference picklist values
        for (const [, ruleXml] of readXml.matchAll(/<sharingCriteriaRules>([\s\S]*?)<\/sharingCriteriaRules>/g)) {
          if (!ruleXml.includes(`<value>${xmlValue}</value>`)) continue;
          const ruleName = ruleXml.match(/<fullName>([^<]+)<\/fullName>/)?.[1] || containerName;
          matchedNames.push(ruleName);
        }
      } catch { /* skip */ }
    }

    if (!matchedNames.length) return [];

    // Fetch rule record IDs and the object's key prefix in parallel
    const [ruleRecords, entityDefs] = await Promise.all([
      restQuery(`SELECT Id, DeveloperName FROM CriteriaBasedSharingRule WHERE SobjectType = '${objName}'`).catch(() => []),
      toolingQuery(`SELECT KeyPrefix FROM EntityDefinition WHERE QualifiedApiName = '${objName}'`).catch(() => []),
    ]);
    const ruleIdMap = new Map(ruleRecords.map(r => [r.DeveloperName, r.Id]));
    const keyPrefix = entityDefs[0]?.KeyPrefix || '';

    return matchedNames.map(name => {
      const ruleId = ruleIdMap.get(name) || '';
      const id = ruleId && keyPrefix ? `${ruleId}:${keyPrefix}` : ruleId;
      return { id, name, snippets: [], linkType: 'SharingRule' };
    });
  }
}
