chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

function isIgnorableMessageError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return (
    message.includes("Could not establish connection. Receiving end does not exist.") ||
    message.includes("A listener indicated an asynchronous response") ||
    message.includes("The message port closed before a response was received")
  );
}

async function getTabId() {
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

function updateSidePanelForTab(tabId?: number) {
  if (!tabId) {
    return;
  }

  chrome.tabs.sendMessage(tabId, { action: "updateSidePanel" }, () => {
    const messageError = chrome.runtime.lastError;
    if (!messageError || isIgnorableMessageError(messageError.message)) {
      return;
    }
    console.error(messageError.message);
  });
}

async function updateSidePanel() {
  const tabId = await getTabId();
  updateSidePanelForTab(tabId ?? undefined);
}

chrome.tabs.onCreated.addListener(() => {
  updateSidePanel();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  updateSidePanelForTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) {
    return;
  }

  if (changeInfo.status === "complete" || typeof changeInfo.url === "string") {
    updateSidePanelForTab(tabId);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  updateSidePanel();
});
