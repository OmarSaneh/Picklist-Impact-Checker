import { getSession, soapMetadata } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class QuickActionScanner extends MetadataScanner {
  get label() { return 'Quick Actions'; }

  async scan(objName, value) {
    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'plain' }];
    }

    let listXml;
    try {
      listXml = await soapMetadata(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>QuickAction</met:type></met:queries>
        </met:listMetadata>`);
    } catch { return []; }

    // Only scan quick actions scoped to this object (fullName = "ObjectName.ActionName")
    // listMetadata returns <id> alongside <fullName> in each <result> block — extract both
    const prefix = `${objName}.`;
    const idMap = new Map();
    for (const [, block] of listXml.matchAll(/<result>([\s\S]*?)<\/result>/g)) {
      const fullName = block.match(/<fullName>([^<]+)<\/fullName>/)?.[1];
      const id       = block.match(/<id>([^<]+)<\/id>/)?.[1];
      if (fullName && id) idMap.set(fullName, id);
    }
    const fullNames = [...idMap.keys()].filter(n => n.startsWith(prefix));
    if (!fullNames.length) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const fullName of fullNames) {
      try {
        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>QuickAction</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);

        // Field overrides use <fieldOverrides><literalValue> for picklist/string values
        const matched = [...readXml.matchAll(/<fieldOverrides>([\s\S]*?)<\/fieldOverrides>/g)]
          .some(([, xml]) => xml.includes(`<literalValue>${xmlValue}</literalValue>`));
        if (matched) {
          results.push({ id: idMap.get(fullName) || '', name: fullName.slice(prefix.length), snippets: [], linkType: 'QuickAction' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
