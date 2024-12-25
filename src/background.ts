chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

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
    chrome.tabs.sendMessage(tabId, { action: "updateSidePanel" });
  }
}

chrome.tabs.onCreated.addListener(() => {
  console.log("Tab created");
  updateSidePanel();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateSidePanel();
  }
});
