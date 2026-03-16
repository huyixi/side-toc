const CONTENT_SCRIPT_FILES = ["js/vendor.js", "js/content_script.js"];
const INJECTABLE_PROTOCOLS = new Set(["http:", "https:", "file:"]);
const UNSUPPORTED_PROTOCOL_PREFIXES = [
  "about:",
  "brave:",
  "chrome:",
  "chrome-extension:",
  "devtools:",
  "edge:",
  "moz-extension:",
  "opera:",
  "vivaldi:",
  "view-source:",
];
const UNSUPPORTED_HOSTS = new Set([
  "chrome.google.com",
  "chromewebstore.google.com",
]);

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

function isTransientMessageError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return (
    message.includes("A listener indicated an asynchronous response") ||
    message.includes("The message port closed before a response was received")
  );
}

function isMissingReceiverError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return message.includes(
    "Could not establish connection. Receiving end does not exist."
  );
}

function isUnsupportedInjectionError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return (
    message.includes("Cannot access a chrome:// URL") ||
    message.includes("Cannot access contents of url") ||
    message.includes("The extensions gallery cannot be scripted")
  );
}

function getTabUrl(tab?: chrome.tabs.Tab | null): string {
  const tabWithPendingUrl = tab as chrome.tabs.Tab & { pendingUrl?: string };
  return tab?.url ?? tabWithPendingUrl.pendingUrl ?? "";
}

function isInjectablePageUrl(url?: string): boolean {
  if (!url) {
    return false;
  }

  const lowerUrl = url.toLowerCase();
  if (
    UNSUPPORTED_PROTOCOL_PREFIXES.some((prefix) => lowerUrl.startsWith(prefix))
  ) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    if (!INJECTABLE_PROTOCOLS.has(parsedUrl.protocol)) {
      return false;
    }

    return !UNSUPPORTED_HOSTS.has(parsedUrl.hostname);
  } catch (_error) {
    return false;
  }
}

function notifySidePanelSyncError(
  tabId: number,
  reason: SidePanelSyncErrorReason
) {
  chrome.runtime.sendMessage(
    {
      action: "sidePanelSyncError",
      tabId,
      reason,
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tabs && tabs.length > 0) {
    return tabs[0].id;
  }

  console.error("No active tab found.");
  return null;
}

async function getTabById(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.get(tabId);
  } catch (_error) {
    return null;
  }
}

function sendMessageToTab(
  tabId: number,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; errorMessage?: string }> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, () => {
      const messageError = chrome.runtime.lastError;
      if (messageError) {
        resolve({ ok: false, errorMessage: messageError.message });
        return;
      }

      resolve({ ok: true });
    });
  });
}

async function injectContentScript(
  tabId: number
): Promise<{ ok: boolean; errorMessage?: string }> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES,
    });
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { ok: false, errorMessage };
  }
}

async function tryRepairMissingContentScript(
  tabId: number
): Promise<SidePanelSyncErrorReason | null> {
  const tab = await getTabById(tabId);
  const tabUrl = getTabUrl(tab);

  if (!isInjectablePageUrl(tabUrl)) {
    return "unsupportedPage";
  }

  const injectionResult = await injectContentScript(tabId);
  if (!injectionResult.ok) {
    if (!isUnsupportedInjectionError(injectionResult.errorMessage)) {
      console.error(injectionResult.errorMessage);
      return "missingContentScript";
    }

    return "unsupportedPage";
  }

  const retryResult = await sendMessageToTab(tabId, {
    action: "updateSidePanel",
  });
  if (retryResult.ok) {
    return null;
  }

  if (
    retryResult.errorMessage &&
    !isTransientMessageError(retryResult.errorMessage)
  ) {
    console.error(retryResult.errorMessage);
  }

  return "missingContentScript";
}

async function updateSidePanelForTab(
  tabId?: number
): Promise<{ ok: boolean; reason?: SidePanelSyncErrorReason }> {
  if (!tabId) {
    return { ok: false, reason: "unsupportedPage" };
  }

  const messageResult = await sendMessageToTab(tabId, {
    action: "updateSidePanel",
  });
  if (messageResult.ok) {
    return { ok: true };
  }

  if (
    !isTransientMessageError(messageResult.errorMessage) &&
    !isMissingReceiverError(messageResult.errorMessage)
  ) {
    console.error(messageResult.errorMessage);
  }

  if (!isMissingReceiverError(messageResult.errorMessage)) {
    return { ok: false, reason: "missingContentScript" };
  }

  const repairReason = await tryRepairMissingContentScript(tabId);
  if (!repairReason) {
    return { ok: true };
  }

  notifySidePanelSyncError(tabId, repairReason);
  return { ok: false, reason: repairReason };
}

async function updateSidePanel() {
  const tabId = await getActiveTabId();
  return updateSidePanelForTab(tabId ?? undefined);
}

async function prewarmContentScriptsAfterUpdate() {
  const tabs = await chrome.tabs.query({ active: true });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !isInjectablePageUrl(getTabUrl(tab))) {
        return;
      }

      const injectionResult = await injectContentScript(tab.id);
      if (
        !injectionResult.ok &&
        !isUnsupportedInjectionError(injectionResult.errorMessage)
      ) {
        console.error(injectionResult.errorMessage);
      }
    })
  );
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "update") {
    return;
  }

  void prewarmContentScriptsAfterUpdate();
});

chrome.tabs.onCreated.addListener(() => {
  void updateSidePanel();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void updateSidePanelForTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) {
    return;
  }

  if (changeInfo.status === "complete" || typeof changeInfo.url === "string") {
    void updateSidePanelForTab(tabId);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  void updateSidePanel();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (message && message.action === "refreshActiveTabToc") {
    updateSidePanel()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error(error);
        sendResponse({ ok: false, reason: "missingContentScript" });
      });
    return true;
  }

  return false;
});
