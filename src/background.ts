chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

async function getActivateTabId() {
  try {
    const [tabs] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs) {
      return tabs.id;
    } else {
      console.error("No activate Tab found!");
    }
  } catch (e) {
    console.error("getActivateTabId error", e);
  }
}

async function updateSidePanel() {
  const tabId = await getActivateTabId();
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action: "updateSidePanel" });
    console.log("background script send updatesidepanel message");
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateSidePanel();
  }
});
