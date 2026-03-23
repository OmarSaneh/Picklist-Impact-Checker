// MV3 service worker for Picklist Impact Checker.
// Handles GET_SESSION messages from the content script, since content scripts
// cannot read cookies directly.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Picklist Impact Checker installed.');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SOAP_METADATA') {
    (async () => {
      try {
        const res = await fetch(`${msg.instanceUrl}/services/Soap/m/59.0`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '""' },
          body: msg.body,
        });
        const xml = await res.text();
        sendResponse({ xml });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (msg.type !== 'GET_SESSION') return false;

  (async () => {
    try {
      // Content script runs on *.salesforce-setup.com; the API lives on *.salesforce.com.
      // Derive the API hostname by replacing the domain suffix.
      const setupHostname = msg.hostname; // e.g. "myorg.sandbox.my.salesforce-setup.com"
      const apiHostname = setupHostname.replace('.salesforce-setup.com', '.salesforce.com');
      const instanceUrl = `https://${apiHostname}`;

      // Try to get the sid cookie from the API domain.
      let cookie = await chrome.cookies.get({ url: instanceUrl, name: 'sid' });

      if (!cookie) {
        // Fallback: search all SF cookies and match against the known org domain.
        // Never blindly pick sfCookies[0] — wrong-org auth silently corrupts all results.
        const allCookies = await chrome.cookies.getAll({ name: 'sid' });
        const sfCookies = allCookies.filter(c => {
          const d = c.domain.replace(/^\./, '');
          return d.endsWith('salesforce.com') || d.endsWith('force.com');
        });
        // Derive the requesting tab's hostname as a secondary signal.
        let tabHostname = '';
        try { tabHostname = sender.tab?.url ? new URL(sender.tab.url).hostname : ''; } catch { }
        cookie = sfCookies.find(c => {
          const d = c.domain.replace(/^\./, '');
          return apiHostname.includes(d) || (tabHostname && tabHostname.includes(d));
        }) || null;
      }

      if (!cookie) {
        sendResponse({ error: 'NO_COOKIE' });
        return;
      }

      // SF session IDs are URL-encoded in the cookie (! → %21). Always decode.
      const sid = decodeURIComponent(cookie.value);
      sendResponse({ sid, instanceUrl });
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();

  // Return true to signal async sendResponse.
  return true;
});
