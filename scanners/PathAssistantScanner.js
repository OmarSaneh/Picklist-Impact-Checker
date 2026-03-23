import { getSession, soapMetadata } from '../api.js';
import { toolingQuery } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class PathAssistantScanner extends MetadataScanner {
  get label() { return 'Path Assistants'; }

  async scan(_objName, value) {
    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) {
      return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: null }];
    }

    // FullName is null in bulk Tooling queries — fetch the fields we need to construct it:
    // Master record type  → "Case-Status"
    // Specific record type → "RecordTypeDeveloperName_Case_Status"
    let list;
    try {
      list = await toolingQuery(
        `SELECT Id, MasterLabel, SobjectType, SobjectProcessField, IsMasterRecordType, RecordTypeId FROM PathAssistant`
      );
    } catch { return []; }
    if (!list.length) return [];

    // Pre-fetch RecordType developer names for non-master paths
    const rtIds = [...new Set(list.filter(pa => !pa.IsMasterRecordType && pa.RecordTypeId).map(pa => pa.RecordTypeId))];
    const rtMap = new Map();
    for (const rtId of rtIds) {
      try {
        const rt = await toolingQuery(`SELECT DeveloperName FROM RecordType WHERE Id = '${rtId}'`);
        if (rt.length) rtMap.set(rtId, rt[0].DeveloperName);
      } catch { /* skip */ }
    }

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    for (const pa of list) {
      try {
        const fullName = pa.IsMasterRecordType
          ? `${pa.SobjectType}-${pa.SobjectProcessField}`
          : `${rtMap.get(pa.RecordTypeId) || pa.RecordTypeId}_${pa.SobjectType}_${pa.SobjectProcessField}`;

        const readXml = await soapMetadata(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>PathAssistant</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);
        if (readXml.includes(`<fieldValue>${xmlValue}</fieldValue>`)) {
          const name = pa.MasterLabel || fullName;
          results.push({ id: '', name, snippets: [], linkType: 'plain' });
        }
      } catch { /* skip */ }
    }
    return results;
  }
}
