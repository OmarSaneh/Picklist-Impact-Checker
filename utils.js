import { getSessionCached } from './api.js';

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function getMatchingSnippets(body, value, maxSnippets = 3, maxLen = 150) {
  if (!body) return [];
  const snippets = [];
  for (const line of body.split('\n')) {
    if (line.includes(value)) {
      snippets.push(line.trim().slice(0, maxLen));
      if (snippets.length >= maxSnippets) break;
    }
  }
  return snippets;
}

export function buildSetupUrl(type, id, objName) {
  const session = getSessionCached();
  const apiBase = session ? session.instanceUrl : `https://${location.hostname.replace('.salesforce-setup.com', '.salesforce.com')}`;
  const setupBase = apiBase.replace('.salesforce.com', '.salesforce-setup.com');
  switch (type) {
    case 'ValidationRule': return `${setupBase}/lightning/setup/ObjectManager/${objName}/ValidationRules/${id}/view`;
    case 'FormulaField':   return `${setupBase}/lightning/setup/ObjectManager/${objName}/FieldsAndRelationships/view`;
    case 'Flow':           return `${apiBase}/builder_platform_interaction/flowBuilder.app?flowId=${id}`;
    case 'ApexClass':      return `${setupBase}/lightning/setup/ApexClasses/home`;
    case 'ApexTrigger':    return `${setupBase}/lightning/setup/ApexTriggers/home`;
    case 'WorkflowRule':   return `${setupBase}/lightning/setup/WorkflowRules/home`;
    case 'AuraComponent':  return `${setupBase}/lightning/setup/AuraDefinitionBundles/home`;
    case 'VisualforcePage': return `${setupBase}/lightning/setup/ApexPages/home`;
    case 'ApprovalProcess': return id ? `${setupBase}/lightning/setup/ApprovalProcesses/page?address=%2F${id}` : `${setupBase}/lightning/setup/ApprovalProcesses/home`;
    case 'ListView':       return `/lightning/o/${objName}/list?filterName=${id}`;
    case 'EmailTemplate':  return `${setupBase}/lightning/setup/CommunicationTemplatesEmail/home`;
    case 'PathAssistant':  return `${setupBase}/lightning/setup/PathAssistant/home`;
    case 'Report':              return `${apiBase}/lightning/r/Report/${id}/view`;
    case 'RecordType':          return `${setupBase}/lightning/setup/ObjectManager/${objName}/RecordTypes/${id}/view`;
    case 'SupportProcess':      return `${setupBase}/lightning/setup/SupportProcesses/home`;
    case 'EscalationRule':      return `${setupBase}/lightning/setup/CaseEscalationRules/home`;
    case 'EntitlementProcess':  return `${setupBase}/lightning/setup/EntitlementProcesses/home`;
    default:                    return setupBase;
  }
}
