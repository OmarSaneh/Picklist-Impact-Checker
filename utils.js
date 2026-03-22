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
    default:               return setupBase;
  }
}
