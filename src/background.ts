chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

function isIgnorableMessageError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return (
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

async function updateSidePanel() {
  const tabId = await getTabId();
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action: "updateSidePanel" }, () => {
      const messageError = chrome.runtime.lastError;
      if (!messageError || isIgnorableMessageError(messageError.message)) {
        return;
      }
      console.error(messageError.message);
    });
  }
}

chrome.tabs.onCreated.addListener(() => {
  updateSidePanel();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateSidePanel();
  }
});
