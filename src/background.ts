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

function isUnsupportedPageError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return message.includes(
    "Could not establish connection. Receiving end does not exist."
  );
}

function notifySidePanelSyncError(tabId: number) {
  chrome.runtime.sendMessage(
    {
      action: "sidePanelSyncError",
      tabId,
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
  } else {
    console.error("No activate Tab found!");
    return null;
  }
}

function updateSidePanelForTab(tabId?: number): Promise<boolean> {
  if (!tabId) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: "updateSidePanel" }, () => {
      const messageError = chrome.runtime.lastError;
      if (!messageError) {
        resolve(true);
        return;
      }

      if (!isTransientMessageError(messageError.message)) {
        console.error(messageError.message);
      }

      if (isUnsupportedPageError(messageError.message)) {
        notifySidePanelSyncError(tabId);
      }

      resolve(false);
    });
  });
}

async function updateSidePanel() {
  const tabId = await getActiveTabId();
  return updateSidePanelForTab(tabId ?? undefined);
}

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
      .then((ok) => {
        sendResponse({ ok });
      })
      .catch((error) => {
        console.error(error);
        sendResponse({ ok: false });
      });
    return true;
  }

  return false;
});
