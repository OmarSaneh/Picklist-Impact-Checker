import { getSession, restQuery, soapMetadata } from '../api.js';
import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class PathAssistantScanner extends MetadataScanner {
  get label() { return 'Path Assistants'; }

  async scan(_objName, value) {
    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: null }];
    }

    // Get paths from Tooling API (has SobjectType, SobjectProcessField, RecordTypeId)
    let paths;
    try {
      paths = await toolingQuery(
        `SELECT Id, MasterLabel, SobjectType, SobjectProcessField, IsMasterRecordType, RecordTypeId FROM PathAssistant`
      );
    } catch { return []; }
    if (!paths.length) return [];

    // Fetch RecordType DeveloperNames via standard REST (RecordType is not in Tooling API)
    const rtIds = [...new Set(paths.filter(p => !p.IsMasterRecordType && p.RecordTypeId).map(p => p.RecordTypeId))];
    const rtMap = new Map();
    if (rtIds.length) {
      try {
        const idList = rtIds.map(id => `'${id}'`).join(',');
        const rts = await restQuery(`SELECT Id, DeveloperName FROM RecordType WHERE Id IN (${idList})`);
        for (const rt of rts) rtMap.set(rt.Id, rt.DeveloperName);
      } catch { /* proceed without — SOAP fullName may be wrong but we'll skip on fault */ }
    }

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const pa of paths) {
      try {
        // SOAP fullName: master → "Case-Status", specific RT → "RecordTypeDev_Case_Status"
        const fullName = pa.IsMasterRecordType
          ? `${pa.SobjectType}-${pa.SobjectProcessField}`
          : `${rtMap.get(pa.RecordTypeId)}_${pa.SobjectType}_${pa.SobjectProcessField}`;

        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>PathAssistant</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);
        if (readXml.includes(`<picklistValueName>${xmlValue}</picklistValueName>`)) {
          results.push({ id: '', name: pa.MasterLabel, snippets: [], linkType: 'plain' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
