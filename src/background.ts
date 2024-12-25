chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

async function getActivateTabId() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tabs) {
    return tabs[0].id;
  } else {
    console.error("No activate Tab found!");
  }
}

async function updateSidePanel() {
  const tabId = await getActivateTabId();
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action: "updateSidePanel" });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateSidePanel();
  }
});
