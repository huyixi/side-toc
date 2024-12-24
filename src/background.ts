chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

async function updateSidePanel() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0].id;
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action: "updateSidePanel" });
    console.log("background script send updatesidepanel message");
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    console.log("tabs updated", tabId, changeInfo, tab);
    updateSidePanel();
  }
});
