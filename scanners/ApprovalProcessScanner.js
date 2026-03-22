import { getSession } from '../api.js';
import { MetadataScanner } from './MetadataScanner.js';

export class ApprovalProcessScanner extends MetadataScanner {
  get label() { return 'Approval Processes'; }

  async #soap(instanceUrl, sid, body) {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header><met:SessionHeader><met:sessionId>${sid}</met:sessionId></met:SessionHeader></soapenv:Header>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`;
    const result = await chrome.runtime.sendMessage({ type: 'SOAP_METADATA', instanceUrl, body: envelope });
    if (result.error) throw new Error(result.error);
    const xml = result.xml;
    if (xml.includes('soapenv:Fault') || xml.includes(':Fault>')) {
      const msg = xml.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] || xml.slice(0, 300);
      throw new Error(`SOAP fault: ${msg}`);
    }
    return xml;
  }

  async scan(objName, value) {
    let instanceUrl, sid;
    try { ({ instanceUrl, sid } = await getSession()); } catch (err) { return [{ id: '', name: `⚠ Session error: ${err.message}`, snippets: [], linkType: 'ApprovalProcess' }]; }

    // List all ApprovalProcess metadata names
    let listXml;
    try {
      listXml = await this.#soap(instanceUrl, sid, `
        <met:listMetadata>
          <met:queries><met:type>ApprovalProcess</met:type></met:queries>
          <met:asOfVersion>59.0</met:asOfVersion>
        </met:listMetadata>`);
    } catch (err) { return [{ id: '', name: `⚠ listMetadata error: ${err.message}`, snippets: [], linkType: 'ApprovalProcess' }]; }

    const allFullNames = [...listXml.matchAll(/<fullName>([^<]+)<\/fullName>/g)].map(m => m[1]);
    // Only read approval processes for this object (fullName = "ObjectName.ProcessName")
    const fullNames = allFullNames.filter(n => n.toLowerCase().startsWith(`${objName.toLowerCase()}.`));
    if (fullNames.length === 0) return [];

    const xmlValue = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const results = [];

    // Read one at a time to avoid UNKNOWN_EXCEPTION on large batches
    for (const fullName of fullNames) {
      try {
        const readXml = await this.#soap(instanceUrl, sid, `
          <met:readMetadata>
            <met:type>ApprovalProcess</met:type>
            <met:fullNames>${fullName}</met:fullNames>
          </met:readMetadata>`);

        for (const [, recordXml] of readXml.matchAll(/<records[^>]*>([\s\S]*?)<\/records>/g)) {
          if (!recordXml.includes(`<value>${xmlValue}</value>`)) continue;
          const displayName = fullName.includes('.') ? fullName.split('.').slice(1).join('.') : fullName;
          results.push({ id: '', name: displayName, snippets: [], linkType: 'ApprovalProcess' });
        }
      } catch { /* skip individual */ }
    }
    return results;
  }
}
