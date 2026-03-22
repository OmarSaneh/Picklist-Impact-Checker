// MV3 service worker for Picklist Impact Checker.
// Handles GET_SESSION messages from the content script, since content scripts
// cannot read cookies directly.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Picklist Impact Checker installed.');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // List all frames in the current tab — lets us discover the picklist iframe's real URL
  if (msg.type === 'GET_FRAMES') {
    // Wrap in a Promise so the service worker stays alive until we respond
    chrome.webNavigation.getAllFrames({ tabId: sender.tab.id })
      .then(frames => sendResponse({
        frames: (frames || []).map(f => ({
          url: f.url,
          frameId: f.frameId,
          parentFrameId: f.parentFrameId,
        })),
      }))
      .catch(err => sendResponse({ frames: [], error: err.message }));
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
        // Fallback: search all SF cookies and pick the best match.
        const allCookies = await chrome.cookies.getAll({ name: 'sid' });
        const sfCookies = allCookies.filter(c => {
          const d = c.domain.replace(/^\./, '');
          return d.endsWith('salesforce.com') || d.endsWith('force.com');
        });
        const exact = sfCookies.find(c =>
          apiHostname.includes(c.domain.replace(/^\./, ''))
        );
        cookie = exact || sfCookies[0] || null;
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
